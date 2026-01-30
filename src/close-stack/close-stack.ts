import { type Abortable, mergeAbortSignals } from '@xstd/abortable';
import { type Resource } from '../resource/resource.ts';
import { type CloseSource } from '../resource/types/close-source.ts';
import { type CloseStackPromiseFactory } from './types/close-stack-promise-factory.ts';
import { type AddTeardownOptions } from './types/methods/add-teardown/add-teardown-options.ts';
import { type TeardownFunction } from './types/methods/add-teardown/teardown-function.ts';
import { type AsyncTask } from './types/methods/run-task/async-task.ts';

/**
 * Manages async operations in the context of a `CloseSource`.
 */
export class CloseStack {
  /**
   * Executes an iterable of asynchronous or synchronous functions **sequentially**, passing the provided arguments to each function.
   * If any of the functions throw an error, subsequent functions will still be executed, and,
   * at the end, these errors are aggregated into a chain of `SuppressedError` where the last one is thrown.
   *
   * @param {Iterable<CloseStackPromiseFactory<GArguments>} promiseFactories - An iterable containing functions that return a promise or any value.
   *                                                                           These functions will be executed sequentially.
   * @param {...GArguments} args - Arguments to be passed to each function in the iterable.
   * @return {Promise<void>} A promise that resolves when all functions have been executed, or rejects if any errors occur during execution.
   */
  static async sequentially<GArguments extends unknown[]>(
    promiseFactories: Iterable<CloseStackPromiseFactory<GArguments>>,
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

  /**
   * Executes an iterable of asynchronous or synchronous functions **concurrently**, passing the provided arguments to each function.
   * If any of the functions throw an error, other functions will still be executed, and,
   * at the end, these errors are aggregated and thrown into a single `AggregateError` (note: if only one error is thrown, it will be thrown directly, without being wrapped in an `AggregateError`).
   *
   * @param {Iterable<CloseStackPromiseFactory<GArguments>} promiseFactories - An iterable containing functions that return a promise or any value.
   *                                                                           These functions will be executed concurrently.
   * @param {...GArguments} args - Arguments to be passed to each function in the iterable.
   * @return {Promise<void>} A promise that resolves when all functions have been executed, or rejects if any errors occur during execution.
   */
  static async concurrently<GArguments extends unknown[]>(
    promiseFactories: Iterable<CloseStackPromiseFactory<GArguments>>,
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
      throw errors[0].reason;
    } else if (errors.length > 1) {
      throw new AggregateError(
        errors.map((error: PromiseRejectedResult): unknown => {
          return error.reason;
        }),
      );
    }
  }

  #closed: boolean;
  readonly #closeSignal: AbortSignal;
  readonly #tasks: Promise<unknown>[];
  readonly #concurrentTeardowns: TeardownFunction[];
  readonly #sequentialTeardowns: TeardownFunction[];

  /**
   * Creates a new instance of `CloseStack`.
   *
   * @param {CloseSource} closeSource - The source providing the close signal, either an `AbortSignal` or a `Resource`.
   */
  constructor(closeSource: CloseSource) {
    this.#closed = false;
    this.#closeSignal = closeSource instanceof AbortSignal ? closeSource : closeSource.closeSignal;
    this.#tasks = [];
    this.#concurrentTeardowns = [];
    this.#sequentialTeardowns = [];
  }

  /**
   * Throws an error if the CloseStack is closing or closed.
   *
   * @throws {Error} If closing or closed.
   */
  throwIfClosed(): void {
    if (this.#closed || this.#closeSignal.aborted) {
      throw new Error('Closed.');
    }
  }

  /**
   * Runs a task linked to this CloseStack's lifecycle:
   *
   * - this "task" function is immediately called, and receives a signal aborted when: the task completes, this CloseStack closes, or the provided `signal` from `Abortable` aborts.
   * - the task is added to a list of pending tasks: when this `CloseStack` closes, the returned promise will await the completion (fulfilled or rejected) of all tasks before resolving.
   *
   * @template GReturn - The return type of the task.
   * @param {AsyncTask<GReturn> | PromiseLike<GReturn>} task - The asynchronous task or a promise to execute.
   * @param {Abortable} options - Optional abortable signal for cancellation.
   * @returns {Promise<GReturn>} A promise resolving with the task's result.
   * @throws {Error} If the CloseStack is closing or closed, the provided `signal` aborted, or if the task rejects.
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
   * Adds a teardown function to be executed when this CloseStack closes.
   *
   * When closing, with mode:
   * - `sequential` teardowns are executed sequentially, in reverse order of addition.
   * - `concurrent` teardowns are executed concurrently.
   *
   * @param {TeardownFunction} teardown - The teardown function to execute.
   * @param {AddTeardownOptions} [options] - The execution mode (`sequential` or `concurrent`).
   * @param options.mode - The execution mode (`sequential` or `concurrent`).
   * @param options.signal - Optional abortable signal to remove the teardown.
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

  // adopt<GValue>(value: GValue, teardown: TeardownFunction, options?: AddTeardownOptions): GValue {
  //
  //   return value;
  // }

  /**
   * Adopts a `Resource` to associate its lifecycle with this CloseStack.
   *
   * @template GResource - The type of the resource.
   * @param {GResource} resource - The resource to adopt.
   * @param {Abortable} [options] - Optional abortable signal to remove the adoption.
   * @returns {GResource} The adopted resource for chaining.
   */
  adoptResource<GResource extends Resource>(
    resource: GResource,
    { signal }: Abortable = {},
  ): GResource {
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

  /**
   * Registers an event listener on a specified `EventTarget`, until this CloseStack closes.
   *
   * @template GEvent The type of the event object.
   * @param {EventTarget} target - The target to attach the event listener to.
   * @param {string} type A string representing the event type to listen for (e.g., 'click', 'keydown').
   * @param {(event: GEvent) => void} listener A callback function that will be invoked when the event occurs.
   * @param {AddEventListenerOptions} [options] An optional parameter containing configuration options for the event listener, such as `capture`, `once`, and `passive`.
   *                                            It also supports an additional `signal` option for aborting the listener.
   * @return {void} This method does not return any value.
   */
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
   * Closes this CloseStack, and ensures all tasks and teardown functions are executed in proper cleanup order:
   *
   * 1) awaits that all pending tasks are complete
   * 2) awaits concurrently all `concurrent` teardowns
   * 3) awaits sequentially in reverse order all `sequential` teardowns
   *
   * @param {unknown} reason - The reason for closing the Resource.
   * @returns {Promise<void>} A promise that resolves once all teardowns and tasks are handled.
   * @throws {Error} If called outside the context of the Resource's `close` function, or if it is already closed.
   */
  async close(reason: unknown): Promise<void> {
    if (this.#closed) {
      throw new Error('Already closed.');
    }

    if (!this.#closeSignal.aborted) {
      throw new Error('The "closeSource" must be aborted before closing the CloseStack.');
    }

    this.#closed = true;

    await CloseStack.sequentially(
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
