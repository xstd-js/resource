import { runConcurrentlyVoidPromises } from './run-concurrently-void-promises.js';

export async function runConcurrentlyVoidPromiseFactories<GArguments extends unknown[]>(
  promiseFactories: Iterable<(...args: GArguments) => PromiseLike<any> | any>,
  ...args: GArguments
): Promise<void> {
  return runConcurrentlyVoidPromises(
    Array.from(promiseFactories, (factory: (...args: GArguments) => PromiseLike<any> | any) => {
      return Promise.try(factory, ...args);
    }),
  );
}
