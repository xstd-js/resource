export interface OnCloseResource {
  (reason: unknown): PromiseLike<void> | void;
}

export type OptionalOnCloseResource = OnCloseResource | undefined | void;

export type CloseSource = Resource | AbortSignal;

export class Resource implements AsyncDisposable {
  readonly #close: OnCloseResource | undefined;
  readonly #controller: AbortController;
  readonly #closed: PromiseWithResolvers<void>;

  constructor(close?: OnCloseResource) {
    this.#close = close;
    this.#controller = new AbortController();
    this.#closed = Promise.withResolvers<void>();
  }

  throwIfClosed(): void {
    if (this.#controller.signal.aborted) {
      throw new Error('Resource closed');
    }
  }

  get closeSignal(): AbortSignal {
    return this.#controller.signal;
  }

  get closed(): Promise<void> {
    return this.#closed.promise;
  }

  close(reason?: unknown): Promise<void> {
    if (!this.#controller.signal.aborted) {
      this.#controller.abort(reason);

      this.#closed.resolve(
        this.#close === undefined ? undefined : Promise.try(this.#close, reason),
      );
    }

    return this.#closed.promise;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  closesWith(...closeSources: (CloseSource | undefined)[]): this {
    for (const closeSource of closeSources) {
      if (closeSource instanceof AbortSignal) {
        if (closeSource.aborted) {
          void this.close(closeSource.reason);
        } else {
          closeSource.addEventListener(
            'abort',
            (): void => {
              void this.close(closeSource.reason);
            },
            {
              signal: this.closeSignal,
            },
          );
        }
      } else if (closeSource instanceof Resource) {
        this.closesWith(closeSource.closeSignal);
      }
    }
    return this;
  }
}
