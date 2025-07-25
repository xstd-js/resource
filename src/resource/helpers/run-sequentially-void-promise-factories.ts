export async function runSequentiallyVoidPromiseFactories<GArguments extends unknown[]>(
  promiseFactories: Iterable<(...args: GArguments) => PromiseLike<any> | any>,
  ...args: GArguments
): Promise<void> {
  let isErrored: boolean = false;
  let error: unknown;

  for (const promiseFactory of promiseFactories) {
    try {
      await promiseFactory(...args);
    } catch (closeError: unknown) {
      if (isErrored) {
        error = new SuppressedError(closeError, error);
      } else {
        isErrored = true;
        error = closeError;
      }
    }
  }

  if (isErrored) {
    throw error;
  }
}
