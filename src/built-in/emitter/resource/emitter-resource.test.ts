import { describe, expect, it, vi } from 'vitest';
import { EmitterResource } from './emitter-resource.js';
import { DispatchValue } from './types/dispatch-value.js';

describe('EmitterResource', () => {
  describe('constructor', () => {
    it('should be able to dispatch values', async () => {
      let dispatch!: DispatchValue<number>;

      await using emitter = new EmitterResource<number>(
        (_dispatch: DispatchValue<number>): void => {
          dispatch = _dispatch;
        },
      );

      const spy = vi.fn();
      emitter.listen(spy);

      expect(spy).toHaveBeenCalledTimes(0);

      dispatch(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenNthCalledWith(1, 1);
    });
  });

  describe('static-methods', () => {
    describe('withDispatcher', () => {
      it('should be able to dispatch values', () => {
        const { emitter, dispatch } = EmitterResource.withDispatcher<number>();

        const spy = vi.fn();
        emitter.listen(spy);

        expect(spy).toHaveBeenCalledTimes(0);

        dispatch(1);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenNthCalledWith(1, 1);
      });
    });
  });

  describe('methods', () => {
    describe('dispatch', () => {
      it('should throw if the EmitterResource is closed', () => {
        const { emitter, dispatch } = EmitterResource.withDispatcher<number>();

        emitter.close();

        expect(() => dispatch(5)).toThrow();
      });

      it('should prevent loops', () => {
        const { emitter, dispatch } = EmitterResource.withDispatcher<number>();

        emitter.listen(() => {
          dispatch(1);
        });

        expect(() => dispatch(0)).toThrow();
      });
    });

    describe('listen', () => {
      it('should throw if the EmitterResource is closed', async () => {
        await using emitter = new EmitterResource<number>(() => {});

        const closePromise = emitter.close();

        expect(() => emitter.listen(() => {})).toThrow();

        await closePromise;
      });
    });
  });
});
