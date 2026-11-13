import { type Abortable, mergeAbortSignals } from '@xstd/abortable';
import { debugHooks } from '../debug/debug-hooks.private.ts';
import { NormalClosure } from '../normal-closure/normal-closure.ts';
import { type CloseSource } from './types/close-source.ts';
import { type OnCloseResource } from './types/on-close-resource.ts';
import { type ResourceCloseWithInput } from './types/resource-close-with-input.ts';

/**
 * A `Resource` is an abstract entity representing something **live** that needs to be cleaned up when it's no longer necessary.
 *
 * As an example, a _file handle_ or a _database connection_ are illustrations of live resources that must be closed when no longer required to avoid resource leaks.
 *
 * This class provides a common interface for managing these resources.
 */
export class Resource implements AsyncDisposable {
  readonly #close: OnCloseResource | undefined;
  readonly #controller: AbortController;
  readonly #closed: PromiseWithResolvers<void>;

  /**
   * Creates a new `Resource` instance.
   *
   * @param close - An optional function that will be called when the `Resource` is closed.
   *                This function can be used to perform cleanup or release underlying resources.
   */
  constructor(close?: OnCloseResource) {
    this.#close = close;
    this.#controller = new AbortController();
    this.#closed = Promise.withResolvers<void>();
  }

  /**
   * Ensures the `Resource` is open. Throws an error if the resource is closing or closed.
   *
   * @throws {Error} If the resource is closing or closed.
   */
  throwIfClosed(): void {
    if (this.#controller.signal.aborted) {
      throw new Error('Resource closed', { cause: this.#controller.signal.reason });
    }
  }

  /**
   * Returns an AbortSignal that is _aborted_ when the `Resource` is closing or closed.
   * This signal can be used to handle cancellation logic based on the resource's lifecycle.
   *
   * @returns {AbortSignal} The `AbortSignal` associated with the resource.
   */
  get closeSignal(): AbortSignal {
    return this.#controller.signal;
  }

  /**
   * Returns a Promise that resolves when the `Resource` has been fully closed.
   * This can be used to wait for the completion of the closing operation.
   *
   * Rejects if the _closure function_ throws or rejects.
   *
   * @returns {Promise<void>} A Promise that resolves when the resource is closed.
   */
  get closed(): Promise<void> {
    return this.#closed.promise;
  }

  /**
   * Closes the `Resource`, optionally providing a reason for the closure.
   * If a _closure function_ was provided during construction, it will be invoked.
   *
   * When no `reason` is provided, a `NormalClosure` signal is used instead, marking the closure
   * as normal: the _closure function_ receives it, and it's exposed as the `closeSignal`'s reason.
   *
   * If the _closure function_ throws or rejects, the returned Promise (and `closed`) rejects.
   * Since both share the same Promise instance, observing either one marks the rejection as handled;
   * an unobserved close error is reported as an unhandled rejection.
   *
   * @param {unknown} [reason] - An optional argument describing why the resource is being closed.
   * @returns {Promise<void>} A Promise that resolves when the resource is fully closed.
   */
  close(reason?: unknown): Promise<void> {
    if (!this.#controller.signal.aborted) {
      const closeReason: unknown = reason === undefined ? new NormalClosure() : reason;

      this.#controller.abort(closeReason);

      this.#closed.resolve(
        this.#close === undefined ? undefined : Promise.try(this.#close, closeReason),
      );
    }

    return this.#closed.promise;
  }

  /**
   * Implements the asynchronous disposal protocol.
   * Automatically closes the `Resource` when it goes out of scope or is used with `await using`.
   *
   * The `Resource` is closed without an explicit reason: the closure is then marked as normal
   * with a `NormalClosure` reason (see `close`).
   *
   * @example
   * ```ts
   * async function main() {
   *   await using resource = openFile('/path');
   *   const content = await resource.read();
   *   // The resource will be automatically disposed at the end of the block.
   * }
   * ```
   * @returns {Promise<void>} A Promise that resolves when the resource is closed.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  /**
   * Configures the `Resource` to close in response to `closeSource`'s abortion.
   *
   * @param {CloseSource} closeSource - The primary resource or abort signal used to trigger the resource closing.
   * @param {AbortSignal | undefined} abortSignal - An optional `AbortSignal` to undo the bind.
   */
  #closesWith(closeSource: CloseSource, abortSignal: AbortSignal | undefined): void {
    if (closeSource instanceof Resource) {
      debugHooks.onResourceLink?.({
        from: this,
        to: closeSource,
        type: 'closes-with',
        signal: abortSignal,
      });

      closeSource = closeSource.closeSignal;
    }

    if (closeSource.aborted) {
      void this.close(closeSource.reason);
    } else {
      closeSource.addEventListener(
        'abort',
        (): void => {
          void this.close(closeSource.reason);
        },
        {
          signal: mergeAbortSignals([this.closeSignal, abortSignal]),
        },
      );
    }
  }

  /**
   * Configures the `Resource` to close in response to one or more `CloseSource` instances.
   * `CloseSource` can be another `Resource` or an `AbortSignal`.
   *
   * This is a no-op when the `Resource` is already closed, or when the `options.signal` is already aborted:
   * the call is silently ignored and the `Resource` is returned unchanged.
   *
   * @param {ResourceCloseWithInput} closeSources - A list of sources that will trigger the resource's closure.
   *                                                These can include `Resource` instances or `AbortSignal` objects.
   * @param {Abortable} [options] - An optional `AbortSignal` to undo the bind.
   * @returns {this} The current `Resource` instance for method chaining.
   */
  closesWith(closeSources: ResourceCloseWithInput, { signal }: Abortable = {}): this {
    if (!this.#controller.signal.aborted && !signal?.aborted) {
      if (Array.isArray(closeSources)) {
        for (const closeSource of closeSources) {
          if (closeSource !== undefined) {
            this.#closesWith(closeSource, signal);
          }
        }
      } else {
        this.#closesWith(closeSources as CloseSource, signal);
      }
    }

    return this;
  }
}
