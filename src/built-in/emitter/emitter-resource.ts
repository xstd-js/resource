import { type OnCloseResource, Resource } from '../../resource/resource.js';

export interface ValueListener<GValue> {
  (value: GValue): void;
}

export interface DispatchValue<GValue> {
  (value: GValue): void;
}

export interface EmitterResourceWithDispatcher<GValue> {
  readonly emitter: EmitterResource<GValue>;
  readonly dispatch: DispatchValue<GValue>;
}

export interface InitEmitterResource<GValue> {
  (dispatch: DispatchValue<GValue>): void;
}

export class EmitterResource<GValue> extends Resource {
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

  readonly #listeners: ValueListener<GValue>[];
  #dispatching: boolean;

  constructor(init: InitEmitterResource<GValue>, close?: OnCloseResource) {
    super(close);
    this.#listeners = [];
    this.#dispatching = false;

    init((value: GValue): void => {
      this.#dispatch(value);
    });
  }

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

  listen(listener: ValueListener<GValue>): this {
    this.throwIfClosed();
    this.#listeners.push(listener);
    return this;
  }

  // listen(listener: ValueListener<GValue>, { signal }: Abortable = {}): this {
  //   this.throwIfClosed();
  //
  //   if (!signal?.aborted) {
  //     this.#listeners.push(listener);
  //
  //     signal?.addEventListener(
  //       'abort',
  //       (): void => {
  //         this.#listeners.splice(this.#listeners.indexOf(listener), 1);
  //       },
  //       {
  //         once: true,
  //         signal: this.closeSignal,
  //       },
  //     );
  //   }
  //
  //   return this;
  // }
}
