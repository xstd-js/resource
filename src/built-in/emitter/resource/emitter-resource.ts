import { Resource } from '../../../resource/resource.js';
import { OnCloseResource } from '../../../resource/types/on-close-resource.js';
import { InitEmitterResource } from './types/construct/init-emitter-resource.js';
import { DispatchValue } from './types/dispatch-value.js';
import { EmitterResourceWithDispatcher } from './types/static-methods/with-dispatcher/emitter-resource-with-dispatcher.js';
import { ValueListener } from './types/value-listener.js';

/**
 * The `EmitterResource` class represents a specialized resource that manages event dispatching
 * and listener registration. It ensures proper resource management and avoids memory leaks by tying
 * its lifecycle to resource management patterns.
 *
 * @template GValue - The type of value that the emitter dispatches to registered listeners.
 */
export class EmitterResource<GValue> extends Resource {
  /**
   * Creates a new `EmitterResource` and returns it in an object, along with its _dispatch_ function.
   * This allows external code to emit values to all listeners registered to the emitter.
   *
   * @param close - An optional callback or resource to execute when the emitter is closed.
   * @returns An object containing:
   * - `emitter`: An instance of `EmitterResource` for managing listeners and emitting values.
   * - `dispatch`: A dispatch function that can be used to emit values to all registered listeners.
   *
   * @example
   * ```ts
   * const { emitter, dispatch } = EmitterResource.withDispatcher<number>();
   * emitter.listen(value => console.log(value));
   * dispatch(42);
   * ```
   */
  static withDispatcher<GValue>(close?: OnCloseResource): EmitterResourceWithDispatcher<GValue> {
    let dispatch!: DispatchValue<GValue>;

    const emitter = new EmitterResource<GValue>((_dispatch: DispatchValue<GValue>): void => {
      dispatch = _dispatch;
    }, close);

    return {
      emitter,
      dispatch,
    };
  }

  /**
   * An array of registered listener functions.
   * Each listener is executed when the emitter dispatches a value.
   */
  readonly #listeners: ValueListener<GValue>[];

  /**
   * A flag to prevent recursive or nested dispatch calls,
   * ensuring the stability of the dispatching process.
   */
  #dispatching: boolean;

  /**
   * Constructs a new `EmitterResource` instance.
   *
   * @param init - A function that provides the initialization logic.
   * This function is called during the construction phase with a dispatch function
   * that can trigger the execution of all registered listeners with the given value.
   * @param close - An optional callback to execute when the emitter is closed.
   */
  constructor(init: InitEmitterResource<GValue>, close?: OnCloseResource) {
    super(close);
    this.#listeners = [];
    this.#dispatching = false;

    init((value: GValue): void => {
      this.#dispatch(value);
    });
  }

  /**
   * Dispatches a value to all registered listeners.
   *
   * @param value - The value to be dispatched to each listener.
   * @throws {Error} If the emitter is closed or if a recursive dispatch loop is detected.
   */
  #dispatch(value: GValue): void {
    this.throwIfClosed();

    if (this.#dispatching) {
      throw new Error('Dispatch loop detected.');
    }

    try {
      this.#dispatching = true;

      for (let i: number = 0; i < this.#listeners.length && !this.closeSignal.aborted; i++) {
        this.#listeners[i](value);
      }
    } finally {
      this.#dispatching = false;
    }
  }

  /**
   * Registers a listener to the emitter. The listener is called anytime the emitter dispatches a value.
   *
   * @param listener - The function to be invoked with the dispatched value.
   * @returns The `EmitterResource` instance for chaining.
   * @throws {Error} If the emitter has been closed.
   *
   * @example
   * ```ts
   * const emitter = new EmitterResource<number>();
   * emitter.listen(value => console.log(value));
   * ```
   */
  listen(listener: ValueListener<GValue>): this {
    this.throwIfClosed();
    this.#listeners.push(listener);
    return this;
  }
}
