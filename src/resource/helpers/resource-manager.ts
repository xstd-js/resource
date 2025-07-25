import { type Abortable, mergeAbortSignals } from '@xstd/abortable';
import { CloseSource, Resource } from '../resource.js';
import { runConcurrentlyVoidPromiseFactories } from './run-concurrently-void-promise-factories.js';
import { runSequentiallyVoidPromiseFactories } from './run-sequentially-void-promise-factories.js';

export interface AsyncTask<GReturn> {
  (signal: AbortSignal): PromiseLike<GReturn> | GReturn;
}

export interface TeardownFunction {
  (reason: unknown): PromiseLike<any> | any;
}

export interface AddTeardownOptions extends Abortable {
  readonly mode?: 'sequential' | 'concurrent';
}

export class ResourceManager {
  readonly #closeSignal: AbortSignal;
  readonly #tasks: Promise<unknown>[];
  readonly #concurrentTeardowns: TeardownFunction[];
  readonly #sequentialTeardowns: TeardownFunction[];

  constructor(closeSource: CloseSource) {
    this.#closeSignal = closeSource instanceof AbortSignal ? closeSource : closeSource.closeSignal;
    this.#tasks = [];
    this.#concurrentTeardowns = [];
    this.#sequentialTeardowns = [];
  }

  throwIfClosed(): void {
    if (this.#closeSignal.aborted) {
      throw new Error('Resource closed.');
    }
  }

  async runTask<GReturn>(
    task: AsyncTask<GReturn> | PromiseLike<GReturn>,
    { signal }: Abortable = {},
  ): Promise<GReturn> {
    this.throwIfClosed();

    signal?.throwIfAborted();

    const controller: AbortController = new AbortController();

    const taskPromise: Promise<GReturn> =
      typeof task === 'function' ?
        Promise.try(task, mergeAbortSignals([this.#closeSignal, controller.signal, signal]))
      : Promise.resolve(task);

    this.#tasks.push(taskPromise);

    try {
      return await taskPromise;
    } finally {
      controller.abort();
      this.#tasks.splice(this.#tasks.indexOf(taskPromise), 1);
    }
  }

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

  close(reason: unknown): Promise<void> {
    if (!this.#closeSignal.aborted) {
      throw new Error('"close" must be called inside the "close" function of the Resource.');
    }

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
