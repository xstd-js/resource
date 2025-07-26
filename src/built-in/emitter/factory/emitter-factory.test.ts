import { describe, expect, it, vi } from 'vitest';
import { testTools } from '../../../../fabrique/test/tools.js';
import { EmitterResource } from '../resource/emitter-resource.js';
import { DispatchValue } from '../resource/types/dispatch-value.js';
import { EmitterFactory } from './emitter-factory.js';
import sleep = testTools.sleep;

describe('EmitterFactory', () => {
  describe('constructor', () => {
    it('should be able to dispatch values', async () => {
      let dispatch!: DispatchValue<number>;

      const factory = new EmitterFactory<number>(() => {
        return new EmitterResource<number>((_dispatch: DispatchValue<number>): void => {
          dispatch = _dispatch;
        });
      });

      await using emitter = await factory.open();

      const spy = vi.fn();
      emitter.listen(spy);

      expect(spy).toHaveBeenCalledTimes(0);

      dispatch(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenNthCalledWith(1, 1);
    });
  });

  describe('methods', () => {
    const emitterFactoryWithDispatch = (): {
      factory: EmitterFactory<number>;
      dispatch: DispatchValue<number>;
    } => {
      let dispatch: DispatchValue<number>;

      const factory = new EmitterFactory((): EmitterResource<number> => {
        return new EmitterResource<number>((_dispatch: DispatchValue<number>): void => {
          dispatch = _dispatch;
        });
      });

      return {
        factory,
        dispatch: (value: number): void => {
          dispatch(value);
        },
      };
    };

    describe('map', () => {
      it('should map values', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        await using emitter = await factory.map((v) => v * 2).open();

        const spy = vi.fn();
        emitter.listen(spy);

        expect(spy).toHaveBeenCalledTimes(0);

        dispatch(1);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenNthCalledWith(1, 2);
      });
    });

    describe('filter', () => {
      it('should filter values', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        await using emitter = await factory.filter((v) => v >= 2).open();

        const spy = vi.fn();
        emitter.listen(spy);

        expect(spy).toHaveBeenCalledTimes(0);

        dispatch(1);
        expect(spy).toHaveBeenCalledTimes(0);

        dispatch(2);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenNthCalledWith(1, 2);
      });
    });

    describe('mapFilter', () => {
      it('should map and filter values', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        await using emitter = await factory.mapFilter((v) => (v >= 2 ? v * 2 : null)).open();

        const spy = vi.fn();
        emitter.listen(spy);

        expect(spy).toHaveBeenCalledTimes(0);

        dispatch(1);
        expect(spy).toHaveBeenCalledTimes(0);

        dispatch(2);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenNthCalledWith(1, 4);
      });
    });

    describe('distinct', () => {
      it('should emit only distinct values', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        await using emitter = await factory.distinct().open();

        const spy = vi.fn();
        emitter.listen(spy);

        expect(spy).toHaveBeenCalledTimes(0);

        dispatch(1);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenNthCalledWith(1, 1);

        dispatch(1);
        expect(spy).toHaveBeenCalledTimes(1);

        dispatch(2);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenNthCalledWith(2, 2);
      });
    });

    describe('first', () => {
      it('should return the first value', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        const [first] = await Promise.all([factory.first(), sleep(0).then(() => dispatch(1))]);

        expect(first).toBe(1);
      });

      it('should be abortable', async () => {
        const { factory } = emitterFactoryWithDispatch();

        const controller = new AbortController();
        const promise = factory.first({ signal: controller.signal });
        await sleep(0);
        controller.abort();

        expect(promise).rejects.toThrow();

        try {
          await promise;
        } catch (error: unknown) {}
      });
    });

    describe('toAsyncGenerator', () => {
      it('should be iterable, with cached values', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        const expectedValues = [0, 1, 2, 3];

        await Promise.all([
          Promise.try(async (): Promise<void> => {
            let i: number = 0;
            for await (const value of factory) {
              expect(value).toBe(expectedValues[i]);
              i++;

              if (i === expectedValues.length) {
                break;
              }
            }
          }),
          Promise.try(async (): Promise<void> => {
            await sleep(0);
            for (const value of [0, 1, 2, 3]) {
              dispatch(value);
            }
          }),
        ]);
      });

      it('should be iterable, with edge values', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        const expectedValues = [0, 1, 3];

        await Promise.all([
          Promise.try(async (): Promise<void> => {
            let i: number = 0;
            for await (const value of factory.toAsyncGenerator({ bufferSize: 0 })) {
              expect(value).toBe(expectedValues[i]);
              i++;

              if (i === expectedValues.length) {
                break;
              }
            }
          }),
          Promise.try(async (): Promise<void> => {
            await sleep(0);
            dispatch(0);
            await sleep(0);
            dispatch(1);
            dispatch(2);
            await sleep(0);
            dispatch(3);
          }),
        ]);
      });

      it('should be iterable, with max buffer size', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();

        const expectedValues = [2, 3];

        await Promise.all([
          Promise.try(async (): Promise<void> => {
            let i: number = 0;
            for await (const value of factory.toAsyncGenerator({ bufferSize: 1 })) {
              expect(value).toBe(expectedValues[i]);
              i++;

              if (i === expectedValues.length) {
                break;
              }
            }
          }),
          Promise.try(async (): Promise<void> => {
            await sleep(0);
            dispatch(0);
            dispatch(1);
            dispatch(2);
            await sleep(0);
            dispatch(3);
          }),
        ]);
      });

      it('should be iterable, with expirable values', async () => {
        const { factory, dispatch } = emitterFactoryWithDispatch();
        const expectedValues = [0, 2, 3];

        await Promise.all([
          Promise.try(async (): Promise<void> => {
            let i: number = 0;
            for await (const value of factory.toAsyncGenerator({ windowTime: 100 })) {
              expect(value).toBe(expectedValues[i]);
              i++;

              if (i === 1) {
                await sleep(200);
              }

              if (i === expectedValues.length) {
                break;
              }
            }
          }),
          Promise.try(async (): Promise<void> => {
            await sleep(0);
            dispatch(0);
            await sleep(0);
            dispatch(1);
            await sleep(200);
            dispatch(2);
            await sleep(0);
            dispatch(3);
          }),
        ]);
      });

      it('should be abortable', async () => {
        const { factory } = emitterFactoryWithDispatch();

        const controller = new AbortController();

        const promise = Promise.try(async (): Promise<void> => {
          for await (const _value of factory.toAsyncGenerator({ signal: controller.signal })) {
            expect.unreachable('should not loop');
          }
        });

        await sleep(0);
        controller.abort();

        expect(promise).rejects.toThrow();

        try {
          await promise;
        } catch (error: unknown) {}
      });
    });
  });
});
