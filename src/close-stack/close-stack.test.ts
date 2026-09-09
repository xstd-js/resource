import { sleep } from '@xstd/abortable';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { Resource } from '../resource/resource.ts';
import { CloseStack } from './close-stack.ts';

describe('CloseStack', () => {
  let resource: Resource;
  let closeStack: CloseStack;

  (globalThis as any).SuppressedError ??= class SuppressedError extends Error {
    error: any;
    suppressed: any;

    constructor(error: any, suppressed: any, message?: string) {
      super(message);
      this.error = error;
      this.suppressed = suppressed;
    }
  };

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

  describe('static-methods', () => {
    describe('sequentially', () => {
      it('should await all promises', async () => {
        const called: string[] = [];

        const spyA = async () => {
          await sleep(10);
          called.push('a');
        };

        const spyB = async () => {
          expect(called).toEqual(['a']);
          called.push('b');
        };

        await expect(CloseStack.sequentially([spyA, spyB])).resolves.toBeUndefined();

        expect(called).toEqual(['a', 'b']);
      });

      it('should reject with SuppressedError', async () => {
        const spyA = async () => {
          throw 'a';
        };

        const spyB = async () => {
          throw 'b';
        };

        let rejected = false;
        try {
          await CloseStack.sequentially([spyA, spyB]);
        } catch (error: unknown) {
          rejected = true;
          expect(error).instanceOf(SuppressedError);
          expect((error as SuppressedError).error).toBe('b');
          expect((error as SuppressedError).suppressed).toBe('a');
        }

        expect(rejected).toBe(true);
      });
    });

    describe('concurrently', () => {
      it('should await all promises', async () => {
        const called: string[] = [];

        const spyA = async () => {
          await sleep(10);
          called.push('a');
        };

        const spyB = async () => {
          called.push('b');
          expect(called).toEqual(['b']);
        };

        await expect(CloseStack.concurrently([spyA, spyB])).resolves.toBeUndefined();

        expect(called).toEqual(['b', 'a']);
      });

      it('should reject with single Error', async () => {
        const spyA = async () => {
          throw 'a';
        };

        const spyB = async () => {};

        await expect(CloseStack.concurrently([spyA, spyB])).rejects.toThrow('a');
      });

      it('should reject with AggregateError', async () => {
        const spyA = async () => {
          throw 'a';
        };

        const spyB = async () => {
          throw 'b';
        };

        let rejected = false;
        try {
          await CloseStack.concurrently([spyA, spyB]);
        } catch (error: unknown) {
          rejected = true;
          expect(error).instanceOf(AggregateError);
          expect((error as AggregateError).errors).toEqual(['a', 'b']);
        }

        expect(rejected).toBe(true);
      });
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

        closeStack.adoptResource(child);

        expect(child.closeSignal.aborted).toBe(false);

        await resource.close('test');

        expect(child.closeSignal.aborted).toBe(true);
      });

      it('should be skipped if the signal is immediately aborted', async () => {
        const child = new Resource();

        closeStack.adoptResource(child, { signal: AbortSignal.abort('test') });

        expect(child.closeSignal.aborted).toBe(false);

        await resource.close('test');

        expect(child.closeSignal.aborted).toBe(false);
      });

      it('should throw if closed', async () => {
        resource.close('test');
        expect(() => closeStack.adoptResource(new Resource())).toThrow();
      });

      it('should throw if closed, even with an aborted signal', async () => {
        resource.close('test');
        expect(() =>
          closeStack.adoptResource(new Resource(), { signal: AbortSignal.abort('test') }),
        ).toThrow();
      });

      it('should not emit unhandled rejection when an adopted resource close fails', async () => {
        const unhandledRejectionSpy = vi.fn();
        const onUnhandledRejection = (reason: unknown): void => {
          unhandledRejectionSpy(reason);
        };

        process.on('unhandledRejection', onUnhandledRejection);

        try {
          const child = new Resource((): Promise<void> => Promise.reject(new Error('child close failed')));

          closeStack.adoptResource(child);

          child.closed.catch((): void => {}); // the user observes the child's close error

          await expect(resource.close('test')).rejects.toThrow('child close failed');

          await new Promise((resolve: (value: unknown) => void): void => {
            setTimeout(resolve, 10);
          });
        } finally {
          process.off('unhandledRejection', onUnhandledRejection);
        }

        expect(unhandledRejectionSpy).toHaveBeenCalledTimes(0);
      });
    });

    describe('addEventListener', () => {
      it('should emit event', async () => {
        const spy = vi.fn();
        const target = new EventTarget();
        closeStack.addEventListener(target, 'click', spy);
        const event = new Event('click');
        target.dispatchEvent(event);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenNthCalledWith(1, event);
      });

      it('should throw if closed', async () => {
        resource.close('test');

        expect(() => closeStack.addEventListener(new EventTarget(), 'click', () => {})).toThrow();
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
