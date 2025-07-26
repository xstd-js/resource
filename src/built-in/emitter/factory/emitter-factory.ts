import { type Abortable, abortify } from '@xstd/abortable';
import { EQUAL_FUNCTION_STRICT_EQUAL } from '@xstd/equal-function';
import {
  type FilterFunction,
  type FilterFunctionWithSubType,
  type MapFilterFunction,
  type MapFunction,
} from '@xstd/functional';
import { ResourceFactory } from '../../../factory/resource-factory.js';
import { runSequentiallyVoidPromiseFactories } from '../../../helpers/run-sequentially-void-promise-factories.js';
import { EmitterResource } from '../resource/emitter-resource.js';
import { type DispatchValue } from '../resource/types/dispatch-value.js';
import { type ValueListener } from '../resource/types/value-listener.js';
import { type EmitterFactoryDistinctOptions } from './ytpes/methods/distinct/emitter-factory-distinct-options.js';
import { type EmitterFactoryToAsyncIteratorOptions } from './ytpes/methods/to-async-iterator/emitter-factory-to-async-iterator-options.js';

const NONE = Symbol('NONE');

/**
 * EmitterFactory is a factory class for managing the creation and lifecycle of `EmitterResource` instances.
 * It provides utility operations such as mapping, filtering, transformation, and resource sharing.
 *
 * @template GValue - The type of values emitted by the factory's emitters.
 */
export class EmitterFactory<GValue> extends ResourceFactory<
  [options?: Abortable],
  EmitterResource<GValue>
> {
  /* CHAIN */

  /**
   * Maps the opened EmitterResource to a new one using the provided mapping function.
   *
   * @experimental
   * @template GNewValue - The type of values for the new EmitterResource.
   * @param mapFnc - A function that maps the current EmitterResource to the new one.
   * @returns A new EmitterFactory that produces the mapped EmitterResource.
   */
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

  /**
   * Transforms the emitted values using a custom dispatch function.
   *
   * @template GNewValue - Type of the transformed values.
   * @param onValue - Function invoked when a new value is emitted, using a custom dispatch.
   * @returns A new EmitterFactory producing resources of transformed values.
   */
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

  /**
   * Maps emitted values to new values via a synchronous mapping function.
   *
   * @template GNewValue - The new type of transformed values.
   * @param mapFnc - Function to map the emitted value to a new value.
   * @returns An `EmitterFactory` that emits transformed values.
   */
  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): EmitterFactory<GNewValue> {
    return this.transform((value: GValue, dispatch: DispatchValue<GNewValue>): void => {
      dispatch(mapFnc(value));
    });
  }

  /**
   * Filters emitted values based on a provided condition.
   *
   * @template GNewValue - The new type of values that pass the filter.
   * @param filterFnc - Function to filter emitted values.
   * @returns An `EmitterFactory` that emits only the filtered values.
   */
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

  /**
   * Combines filtering and mapping into one step. Only non-null results from the mapper
   * are emitted by the returned factory.
   *
   * @template GNewValue - The type of mapped and filtered values.
   * @param mapFilterFnc - Function that combines mapping and filtering.
   * @returns An `EmitterFactory` emitting filtered and mapped values.
   */
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

  /**
   * Ensures that only distinct emitted values are propagated.
   *
   * @param options - Configuration options that include an initial value
   * and a custom equality function.
   * @returns An `EmitterFactory` emitting distinct values based on equality.
   */
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

  /**
   * Shares the resource instance, preserving value emissions across multiple consumers.
   *
   * @returns A shared `EmitterFactory` instance.
   */
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

  /**
   * Returns a Promise resolved with the first emitted value of this factory.
   *
   * @param options - An optional AbortSignal to abort this task.
   * @returns A promise resolving with the first emitted value.
   */
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

  /**
   * Opens the `EmitterResource and converts the emitted values into an asynchronous generator.
   *
   * @param options - Iterator options like buffer size, window time, and an AbortSignal.
   * @returns An async generator of emitted values.
   */
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

  /**
   * Enables `for-await-of` iteration for the factory's emitted values.
   *
   * @returns An async generator of emitted values.
   */
  [Symbol.asyncIterator](): AsyncGenerator<GValue, void, void> {
    return this.toAsyncGenerator();
  }
}
