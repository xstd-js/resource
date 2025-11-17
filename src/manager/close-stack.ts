import { type Abortable, mergeAbortSignals } from '@xstd/abortable';
import { type Resource } from '../resource/resource.js';
import { type CloseSource } from '../resource/types/close-source.js';
import { type AddTeardownOptions } from './types/methods/add-teardown/add-teardown-options.js';
import { type TeardownFunction } from './types/methods/add-teardown/teardown-function.js';
import { type AsyncTask } from './types/methods/run-task/async-task.js';

/**
 * Manages the async operations used by a `Resource` to ensure a proper cleanup.
 */
export class CloseStack {
  static async sequentially<GArguments extends unknown[]>(
    promiseFactories: Iterable<(...args: GArguments) => PromiseLike<any> | any>,
    ...args: GArguments
  ): Promise<void> {
    let isErrored: boolean = false;
    let error: unknown;

    for (const promiseFactory of promiseFactories) {
      try {
        await promiseFactory(...args);
      } catch (closeError: unknown) {
        if (isErrored) {
          error = new SuppressedError(closeError, error);
        } else {
          isErrored = true;
          error = closeError;
        }
      }
    }

    if (isErrored) {
      throw error;
    }
  }

  static async concurrently<GArguments extends unknown[]>(
    promiseFactories: Iterable<(...args: GArguments) => PromiseLike<any> | any>,
    ...args: GArguments
  ): Promise<void> {
    return this.#concurrentPromises(
      Array.from(promiseFactories, (factory: (...args: GArguments) => PromiseLike<any> | any) => {
        return Promise.try(factory, ...args);
      }),
    );
  }

  static async #concurrentPromises(promises: Iterable<PromiseLike<any>>): Promise<void> {
    const errors: readonly PromiseRejectedResult[] = (await Promise.allSettled(promises)).filter(
      (result: PromiseSettledResult<void>): result is PromiseRejectedResult => {
        return result.status === 'rejected';
      },
    );

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors);
    }
  }

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
   * Runs a task linked to this ResourceManager's lifecycle:
   *
   * - the provided signal is aborted when the task completes, or this ResourceManager closes
   * TODO improve doc
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
    signal?.throwIfAborted();

    this.throwIfClosed();

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
        signal!.removeEventListener('abort', end);
        // NOTE: can be safely removed from the list while closing
        list.splice(list.indexOf(teardown), 1);
      };

      signal?.addEventListener('abort', end);
    }
  }

  /**
   * Adopts a `Resource` to associate its lifecycle with this ResourceManager.
   *
   * @typeParam GResource - The type of the resource.
   * @param resource - The resource to fork and manage.
   * @param signal - Optional abortable signal for cleanup.
   * @returns The forked resource.
   */
  adopt<GResource extends Resource>(resource: GResource, { signal }: Abortable = {}): GResource {
    if (!signal?.aborted) {
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

      resource.closesWith(this.#closeSignal, {
        signal,
      });
    }

    return resource;
  }

  addEventListener<GEvent>(
    target: EventTarget,
    type: string,
    listener: (event: GEvent) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener as EventListener, {
      ...options,
      signal: mergeAbortSignals([this.#closeSignal, options?.signal]),
    });
  }

  /**
   * Ensures all tasks and teardown functions are executed in proper cleanup order:
   *
   * 1) awaits that all pending tasks are complete
   * 2) awaits concurrently all `concurrent` teardowns
   * 3) awaits sequentially in reverse all `sequential` teardowns
   *
   * @param reason - The reason for closing the Resource.
   * @returns A promise that resolves once all teardowns and tasks are handled.
   * @throws {Error} If called outside the context of the Resource's `close` function, or if it is already closed.
   */
  close(reason: unknown): Promise<void> {
    if (this.#closed) {
      return Promise.reject(new Error('Resource closed.'));
    }

    if (!this.#closeSignal.aborted) {
      return Promise.reject(
        new Error('"close" must be called inside the "close" function of the Resource.'),
      );
    }

    this.#closed = true;

    return CloseStack.sequentially(
      [
        (): Promise<any> => {
          return Promise.allSettled(this.#tasks);
        },
        (reason: unknown): Promise<void> => {
          return CloseStack.concurrently(this.#concurrentTeardowns, reason);
        },
        ...this.#sequentialTeardowns.toReversed(),
      ],
      reason,
    );
  }
}
