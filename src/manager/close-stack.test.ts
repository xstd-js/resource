import { sleep } from '@xstd/abortable';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { Resource } from '../resource/resource.js';
import { CloseStack } from './close-stack.js';

describe('CloseStack', () => {
  let resource: Resource;
  let closeStack: CloseStack;

  beforeEach((): void => {
    resource = new Resource((reason: unknown) => closeStack.close(reason));
    closeStack = new CloseStack(resource);
  });

  describe('new', () => {
    it('supports AbortSignal as input', () => {
      closeStack = new CloseStack(AbortSignal.abort('test'));
      expect(() => closeStack.throwIfClosed()).toThrow();
    });
  });

  describe('methods', () => {
    describe('throwIfClosed', () => {
      it('should not throw if not closed', () => {
        expect(() => closeStack.throwIfClosed()).not.toThrow();
      });

      it('should throw if closed', () => {
        resource.close('test');
        expect(() => closeStack.throwIfClosed()).toThrow();
      });
    });

    describe('runTask', () => {
      it('should run a task', async () => {
        const spy = vi.fn(async () => {
          return 1;
        });

        await expect(closeStack.runTask(spy)).resolves.toBe(1);

        expect(spy).toHaveBeenCalledTimes(1);
      });

      it('should accept a fulfilled promise', async () => {
        await expect(closeStack.runTask(Promise.resolve(1))).resolves.toBe(1);
      });

      it('should accept a rejected promise', async () => {
        await expect(closeStack.runTask(Promise.reject('test'))).rejects.toBe('test');
      });

      it('should throw if the signal is aborted', async () => {
        await expect(
          closeStack.runTask(() => {}, { signal: AbortSignal.abort('test') }),
        ).rejects.toThrow('test');
      });

      it('should throw if closed', async () => {
        resource.close('test');
        await expect(closeStack.runTask(() => {})).rejects.toThrow();
      });
    });

    describe('addTeardown', () => {
      describe('sequential', () => {
        it('should be called in reverse order when the resource closes', async () => {
          const called: string[] = [];

          const spyA = vi.fn(() => {
            called.push('a');
          });

          const spyB = vi.fn(() => {
            called.push('b');
          });

          closeStack.addTeardown(spyA);
          closeStack.addTeardown(spyB, { mode: 'sequential' });

          expect(spyA).toHaveBeenCalledTimes(0);
          expect(spyB).toHaveBeenCalledTimes(0);

          await resource.close('test');

          expect(spyA).toHaveBeenCalledTimes(1);
          expect(spyB).toHaveBeenCalledTimes(1);

          expect(called).toEqual(['b', 'a']);
        });
      });

      describe('concurent', () => {
        it('should be called in concurrent order when the resource closes', async () => {
          const called: string[] = [];

          const spyA = vi.fn(() => {
            called.push('a');
          });

          const spyB = vi.fn(() => {
            called.push('b');
          });

          closeStack.addTeardown(spyA, { mode: 'concurrent' });
          closeStack.addTeardown(spyB, { mode: 'concurrent' });

          expect(spyA).toHaveBeenCalledTimes(0);
          expect(spyB).toHaveBeenCalledTimes(0);

          await resource.close('test');

          expect(spyA).toHaveBeenCalledTimes(1);
          expect(spyB).toHaveBeenCalledTimes(1);

          expect(called).toEqual(['a', 'b']);
        });
      });

      describe('signal', () => {
        it('should be skipped if the signal is immediately aborted', () => {
          const spy = vi.fn();
          closeStack.addTeardown(spy, { signal: AbortSignal.abort('test') });

          expect(spy).toHaveBeenCalledTimes(0);
        });

        it('should be skipped if the signal is aborted before closed', async () => {
          const spy = vi.fn();
          const controller = new AbortController();

          closeStack.addTeardown(spy, { signal: controller.signal });

          expect(spy).toHaveBeenCalledTimes(0);

          controller.abort('test');

          await resource.close('test');

          expect(spy).toHaveBeenCalledTimes(0);
        });
      });

      it('should throw if closed', async () => {
        resource.close('test');
        expect(() => closeStack.addTeardown(() => {})).toThrow();
      });
    });

    describe('adopt', () => {
      test('child should be closed if parent closes', async () => {
        const child = new Resource(async () => {
          await sleep(10);
        });

        closeStack.adopt(child);

        expect(child.closeSignal.aborted).toBe(false);

        await resource.close('test');

        expect(child.closeSignal.aborted).toBe(true);
      });

      it('should be skipped if the signal is immediately aborted', async () => {
        const child = new Resource();

        closeStack.adopt(child, { signal: AbortSignal.abort('test') });

        expect(child.closeSignal.aborted).toBe(false);

        await resource.close('test');

        expect(child.closeSignal.aborted).toBe(false);
      });

      it('should throw if closed', async () => {
        resource.close('test');
        expect(() => closeStack.adopt(new Resource())).toThrow();
      });
    });

    describe('close', () => {
      it('should throw if closed', async () => {
        await resource.close('test');
        await expect(closeStack.close('test')).rejects.toThrow();
      });

      it('should throw if the resource is not closed', async () => {
        await expect(closeStack.close('test')).rejects.toThrow();
      });
    });
  });
});
