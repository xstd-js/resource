import { describe, expect, it, vi } from 'vitest';
import { Resource } from '../resource/resource.ts';
import { ResourceFactory } from './resource-factory.ts';

describe('ResourceFactory', () => {
  it('should have expected open behaviour', async () => {
    const openSpy = vi.fn();
    const factory = new ResourceFactory((...args: any[]): Resource => {
      openSpy(...args);
      return new Resource();
    });

    expect(openSpy).toHaveBeenCalledTimes(0);

    await using _resource = await factory.open('test');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenNthCalledWith(1, 'test');
  });
});
