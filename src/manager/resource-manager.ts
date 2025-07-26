import { type Abortable, mergeAbortSignals } from '@xstd/abortable';
import { runConcurrentlyVoidPromiseFactories } from '../helpers/run-concurrently-void-promise-factories.js';
import { runSequentiallyVoidPromiseFactories } from '../helpers/run-sequentially-void-promise-factories.js';
import { type Resource } from '../resource/resource.js';
import { type CloseSource } from '../resource/types/close-source.js';
import { type AddTeardownOptions } from './types/methods/add-teardown/add-teardown-options.js';
import { type TeardownFunction } from './types/methods/add-teardown/teardown-function.js';
import { type AsyncTask } from './types/methods/run-task/async-task.js';

/**
 * Manages the async operations used by a `Resource` to ensure a proper cleanup.
 */
export class ResourceManager {
  #closed: boolean;
  readonly #closeSignal: AbortSignal;
  readonly #tasks: Promise<unknown>[];
  readonly #concurrentTeardowns: TeardownFunction[];
  readonly #sequentialTeardowns: TeardownFunction[];

  /**
   * Creates a new instance of ResourceManager.
   * @param closeSource - The source providing the close signal, either an `AbortSignal` or a `Resource`.
   */
  constructor(closeSource: CloseSource) {
    this.#closed = false;
    this.#closeSignal = closeSource instanceof AbortSignal ? closeSource : closeSource.closeSignal;
    this.#tasks = [];
    this.#concurrentTeardowns = [];
    this.#sequentialTeardowns = [];
  }

  /**
   * Throws an error if the ResourceManager is already closed.
   *
   * @throws {Error} If the resource is closed.
   */
  throwIfClosed(): void {
    if (this.#closed || this.#closeSignal.aborted) {
      throw new Error('Resource closed.');
    }
  }

  /**
   * Runs a task and ensures proper lifecycle management.
   *
   * @typeParam GReturn - The return type of the task.
   * @param task - The asynchronous task or a promise to execute.
   * @param signal - Optional abortable signal for cancellation.
   * @returns A promise resolving to the task's result.
   * @throws {Error} If the resource is closed or the signal is aborted.
   */
  async runTask<GReturn>(
    task: AsyncTask<GReturn> | PromiseLike<GReturn>,
    { signal }: Abortable = {},
  ): Promise<GReturn> {
    this.throwIfClosed();

    signal?.throwIfAborted();

    const controller: AbortController = new AbortController();

    const taskPromise: Promise<GReturn> =
      typeof task === 'function'
        ? Promise.try(task, mergeAbortSignals([this.#closeSignal, controller.signal, signal]))
        : Promise.resolve(task);

    this.#tasks.push(taskPromise);

    try {
      return await taskPromise;
    } finally {
      controller.abort();
      this.#tasks.splice(this.#tasks.indexOf(taskPromise), 1);
    }
  }

  /**
   * Adds a teardown function to be executed during cleanup.
   *
   * @param teardown - The teardown function to execute.
   * @param mode - The execution mode (`sequential` or `concurrent`).
   * @param signal - Optional abortable signal for removal of the teardown.
   */
  addTeardown(
    teardown: TeardownFunction,
    { mode = 'sequential', signal }: AddTeardownOptions = {},
  ): void {
    this.throwIfClosed();

    if (!signal?.aborted) {
      const list: TeardownFunction[] =
        mode === 'sequential' ? this.#sequentialTeardowns : this.#concurrentTeardowns;

      list.push(teardown);

      const end = (): void => {
        signal?.removeEventListener('abort', end);
        list.splice(list.indexOf(teardown), 1);
      };

      signal?.addEventListener('abort', end);
    }
  }

  /**
   * Forks a `Resource` to associate its lifecycle with this ResourceManager.
   *
   * @typeParam GResource - The type of the resource.
   * @param resource - The resource to fork and manage.
   * @param signal - Optional abortable signal for cleanup.
   * @returns The forked resource.
   */
  fork<GResource extends Resource>(resource: GResource, { signal }: Abortable = {}): GResource {
    const controller: AbortController = new AbortController();

    this.addTeardown(
      (reason: unknown): Promise<void> => {
        return resource.close(reason);
      },
      {
        signal: mergeAbortSignals([controller.signal, signal]),
        mode: 'concurrent',
      },
    );

    resource.closed.then((): void => {
      controller.abort();
    });

    resource.closesWith(this.#closeSignal);

    return resource;
  }

  /**
   * Ensures all tasks and teardown functions are executed in proper cleanup order:
   *
   * 1) awaits that all pending tasks are complete
   * 2) awaits concurrently all `concurrent` teardowns
   * 3) awaits sequentially and in reserve all `sequential` teardowns
   *
   * @param reason - The reason for closing the Resource.
   * @returns A promise that resolves once all teardowns and tasks are handled.
   * @throws {Error} If called outside the context of the `close` function on a Resource, or if it is already closed.
   */
  close(reason: unknown): Promise<void> {
    if (this.#closed) {
      throw new Error('Resource closed.');
    }

    if (!this.#closeSignal.aborted) {
      throw new Error('"close" must be called inside the "close" function of the Resource.');
    }

    this.#closed = true;

    return runSequentiallyVoidPromiseFactories(
      [
        (): Promise<any> => {
          return Promise.allSettled(this.#tasks);
        },
        (reason: unknown): Promise<void> => {
          return runConcurrentlyVoidPromiseFactories(this.#concurrentTeardowns, reason);
        },
        ...this.#sequentialTeardowns.toReversed(),
      ],
      reason,
    );
  }
}
