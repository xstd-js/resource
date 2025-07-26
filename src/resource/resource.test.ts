import { describe, expect, it, vi } from 'vitest';
import { Resource } from './resource.js';

describe('Resource', () => {
  it('should have expected close behaviour', async () => {
    const closeHookSpy = vi.fn();
    const resource = new Resource(closeHookSpy);

    expect(resource.closeSignal.aborted).toBe(false);
    expect(resource.closeSignal.reason).toBe(undefined);
    expect(() => resource.throwIfClosed()).not.toThrow();

    const abortSpy = vi.fn();
    resource.closeSignal.addEventListener('abort', abortSpy);
    expect(abortSpy).toHaveBeenCalledTimes(0);

    const closedSpy = vi.fn();
    resource.closed.then(closedSpy);
    expect(closedSpy).toHaveBeenCalledTimes(0);

    const untilClosed = resource.close('test');

    expect(resource.close('test2')).toBe(untilClosed);

    expect(resource.closeSignal.aborted).toBe(true);
    expect(resource.closeSignal.reason).toBe('test');
    expect(() => resource.throwIfClosed()).toThrow();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(closedSpy).toHaveBeenCalledTimes(0);

    await untilClosed;

    expect(closedSpy).toHaveBeenCalledTimes(1);
  });

  it('should be disposable', async () => {
    const resource = new Resource();

    expect(resource.closeSignal.aborted).toBe(false);

    const closedSpy = vi.fn();
    resource.closed.then(closedSpy);
    expect(closedSpy).toHaveBeenCalledTimes(0);

    await resource[Symbol.asyncDispose]();

    expect(resource.closeSignal.aborted).toBe(true);
    expect(closedSpy).toHaveBeenCalledTimes(1);
  });

  describe('methods', () => {
    describe('closesWith', () => {
      it('should close from an AbortSignal', async () => {
        const controller = new AbortController();
        const resource = new Resource().closesWith(controller.signal);

        expect(resource.closeSignal.aborted).toBe(false);

        controller.abort('test');

        expect(resource.closeSignal.aborted).toBe(true);
        expect(resource.closeSignal.reason).toBe('test');

        await resource.closed;
      });

      it('should close from an aborted AbortSignal', async () => {
        const controller = new AbortController();
        controller.abort('test');

        const resource = new Resource().closesWith(controller.signal);

        expect(resource.closeSignal.aborted).toBe(true);
        expect(resource.closeSignal.reason).toBe('test');

        await resource.closed;
      });

      it('should close from another Resource', async () => {
        const main = new Resource();
        const resource = new Resource().closesWith(main);

        expect(resource.closeSignal.aborted).toBe(false);

        main.close('test');

        expect(resource.closeSignal.aborted).toBe(true);
        expect(resource.closeSignal.reason).toBe('test');

        await resource.closed;
      });

      it('should support undefined', async () => {
        const resource = new Resource().closesWith(undefined);

        expect(resource.closeSignal.aborted).toBe(false);
      });
    });
  });
});
