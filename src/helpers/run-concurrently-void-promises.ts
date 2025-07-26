export async function runConcurrentlyVoidPromises(
  promises: Iterable<PromiseLike<any>>,
): Promise<void> {
  const errors: readonly PromiseRejectedResult[] = (await Promise.allSettled(promises)).filter(
    (result: PromiseSettledResult<void>): result is PromiseRejectedResult => {
      return result.status === 'rejected';
    },
  );

  if (errors.length === 1) {
    throw errors[0];
  } else if (errors.length > 1) {
    throw new AggregateError(errors);
  }
}
