import { FilterFunction } from '@lirx/utils';
import { type Abortable, abortify } from '@xstd/abortable';
import { EQUAL_FUNCTION_STRICT_EQUAL, EqualFunction } from '@xstd/equal-function';
import { FilterFunctionWithSubType, MapFilterFunction, type MapFunction } from '@xstd/functional';
import { ResourceFactory } from '../../resource/factory/resource-factory.js';
import { runSequentiallyVoidPromiseFactories } from '../../resource/helpers/run-sequentially-void-promise-factories.js';
import { DispatchValue, EmitterResource, ValueListener } from './emitter-resource.js';

/** TYPES **/

// DISTINCT

export interface EmitterFactoryDistinctOptions<GValue> {
  readonly initialValue?: GValue;
  readonly equal?: EqualFunction<GValue>;
}

const NONE = Symbol('NONE');

// TO ASYNC ITERATOR

export interface EmitterFactoryToAsyncIteratorOptions extends Abortable {
  readonly bufferSize?: number;
  readonly windowTime?: number;
}

/** CLASS **/

export class EmitterFactory<GValue> extends ResourceFactory<
  [options?: Abortable],
  EmitterResource<GValue>
> {
  /* CHAIN */

  mapResource<GNewValue>(
    mapFnc: MapFunction<EmitterResource<GValue>, EmitterResource<GNewValue>>,
  ): EmitterFactory<GNewValue> {
    return new EmitterFactory<GNewValue>(
      async (options?: Abortable): Promise<EmitterResource<GNewValue>> => {
        return mapFnc(await this.open(options));
      },
    );
  }

  /* CHAIN */

  transform<GNewValue>(
    onValue: (value: GValue, dispatch: DispatchValue<GNewValue>) => void,
  ): EmitterFactory<GNewValue> {
    return new EmitterFactory<GNewValue>(
      async (options?: Abortable): Promise<EmitterResource<GNewValue>> => {
        const listener: EmitterResource<GValue> = await this.open(options);

        return new EmitterResource<GNewValue>(
          (dispatch: DispatchValue<GNewValue>): void => {
            listener.listen((value: GValue): void => {
              onValue(value, dispatch);
            });
          },
          (reason: unknown): Promise<void> => {
            return listener.close(reason);
          },
        ).closesWith(listener);
      },
    );
  }

  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): EmitterFactory<GNewValue> {
    return this.transform((value: GValue, dispatch: DispatchValue<GNewValue>): void => {
      dispatch(mapFnc(value));
    });
  }

  filter<GNewValue extends GValue>(
    filterFnc: FilterFunctionWithSubType<GValue, GNewValue>,
  ): EmitterFactory<GNewValue>;
  filter(filterFnc: FilterFunction<GValue>): EmitterFactory<GValue>;
  filter(filterFnc: FilterFunction<GValue>): EmitterFactory<GValue> {
    return this.transform((value: GValue, dispatch: DispatchValue<GValue>): void => {
      if (filterFnc(value)) {
        dispatch(value);
      }
    });
  }

  mapFilter<GNewValue>(
    mapFilterFnc: MapFilterFunction<GValue, GNewValue>,
  ): EmitterFactory<GNewValue> {
    return this.transform((value: GValue, dispatch: DispatchValue<GNewValue>): void => {
      const newValue: GNewValue | null = mapFilterFnc(value);
      if (newValue !== null) {
        dispatch(newValue);
      }
    });
  }

  distinct({
    initialValue = NONE as GValue,
    equal = EQUAL_FUNCTION_STRICT_EQUAL,
  }: EmitterFactoryDistinctOptions<GValue> = {}): EmitterFactory<GValue> {
    return this.transform((value: GValue, dispatch: DispatchValue<GValue>): void => {
      if (!equal(value, initialValue)) {
        initialValue = value;
        dispatch(value);
      }
    });
  }

  share(): EmitterFactory<GValue> {
    let usageCount: number = 0;

    let openController: AbortController | undefined;
    let openPromise: Promise<void> | undefined;
    let rootRessource: EmitterResource<GValue> | undefined;
    let closePromise: Promise<void> | undefined;

    const listeners: ValueListener<GValue>[] = [];
    let dispatchIndex: number = -1;

    return new EmitterFactory<GValue>(
      async (options?: Abortable): Promise<EmitterResource<GValue>> => {
        options?.signal?.throwIfAborted();

        // await previous close
        if (closePromise !== undefined) {
          await abortify(closePromise, options);
        }

        usageCount++;

        try {
          if (openPromise === undefined) {
            openController = new AbortController();
            openPromise = this.open({
              signal: openController.signal,
            }).then((listener: EmitterResource<GValue>): void => {
              rootRessource = listener;
              rootRessource.listen((value: GValue): void => {
                try {
                  dispatchIndex = 0;
                  while (dispatchIndex < listeners.length) {
                    listeners[dispatchIndex](value);
                    dispatchIndex++;
                  }
                } finally {
                  dispatchIndex = -1;
                }
              });
            });
          }

          await abortify(openPromise, options);

          const { emitter, dispatch } = EmitterResource.withDispatcher<GValue>(
            (reason: unknown): Promise<void> => {
              return runSequentiallyVoidPromiseFactories(
                [
                  (): void => {
                    const index: number = listeners.indexOf(dispatch);
                    // console.assert(index !== -1);
                    if (dispatchIndex !== -1 && index <= dispatchIndex) {
                      dispatchIndex--;
                    }
                    listeners.splice(index, 1);
                  },
                  async (reason: unknown): Promise<void> => {
                    usageCount--;

                    if (usageCount === 0) {
                      openPromise = undefined;

                      // console.assert(rootRessource !== undefined);

                      if (rootRessource!.closeSignal.aborted) {
                        // console.assert(closePromise === undefined);
                        rootRessource = undefined;
                      } else {
                        await (closePromise = rootRessource!.close(reason).finally((): void => {
                          closePromise = undefined;
                          rootRessource = undefined;
                        }));
                      }
                    }
                  },
                ],
                reason,
              );
            },
          );

          listeners.push(dispatch);

          return emitter.closesWith(rootRessource!);
        } catch (error: unknown) {
          usageCount--;

          if (usageCount === 0) {
            openController!.abort(error);
            openController = undefined;
            openPromise = undefined;
            rootRessource = undefined;
          }

          throw error;
        }
      },
    );
  }

  /* PROMISE-BASED */

  async first({ signal }: Abortable = {}): Promise<GValue> {
    await using emitter: EmitterResource<GValue> = await this.open({ signal });

    return await new Promise<GValue>(
      (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
        signal?.throwIfAborted();

        const onAbort = (): void => {
          signal!.removeEventListener('abort', onAbort);
          reject(signal!.reason);
        };

        signal?.addEventListener('abort', onAbort);

        emitter.listen((value: GValue): void => {
          signal?.removeEventListener('abort', onAbort);
          resolve(value);
        });
      },
    );
  }

  async *toAsyncGenerator({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
    signal,
  }: EmitterFactoryToAsyncIteratorOptions = {}): AsyncGenerator<GValue> {
    bufferSize = Math.max(0, bufferSize);
    windowTime = Math.max(0, windowTime);

    interface PendingValue {
      readonly value: GValue;
      readonly expirationDate: number;
    }

    const values: PendingValue[] = [];
    let pendingRead: PromiseWithResolvers<void> | undefined;

    await using listener: EmitterResource<GValue> = (await this.open({ signal }))
      .listen((value: GValue): void => {
        if (bufferSize > 0 && windowTime > 0) {
          values.push({
            value,
            expirationDate: Date.now() + windowTime,
          });

          if (values.length > bufferSize) {
            values.shift();
          }
        } else {
          if (pendingRead !== undefined) {
            values.length = 0;
            values.push({
              value,
              expirationDate: Number.POSITIVE_INFINITY,
            });
          }
        }

        if (pendingRead !== undefined) {
          pendingRead.resolve();
          pendingRead = undefined;
        }
      })
      .closesWith(signal);

    const listenerSignal: AbortSignal = listener.closeSignal;

    while (true) {
      listenerSignal.throwIfAborted();

      // remove the expired values
      const now: number = Date.now();
      while (values.length > 0 && values[0].expirationDate < now) {
        values.shift();
      }

      if (values.length > 0) {
        yield values.shift()!.value;
      } else {
        pendingRead = Promise.withResolvers<void>();

        const onAbort = (): void => {
          listenerSignal.removeEventListener('abort', onAbort);
          pendingRead!.reject(listenerSignal!.reason);
          pendingRead = undefined;
        };

        listenerSignal.addEventListener('abort', onAbort);

        try {
          await pendingRead.promise;
        } finally {
          listenerSignal.removeEventListener('abort', onAbort);
        }
      }
    }
  }

  [Symbol.asyncIterator](): AsyncGenerator<GValue, void, void> {
    return this.toAsyncGenerator();
  }
}
