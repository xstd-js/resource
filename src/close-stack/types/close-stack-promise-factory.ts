/**
 * A function executed by the `CloseStack` static helpers (`sequentially`, `concurrently`):
 * it may return a value or a promise.
 *
 * @template GArguments - The arguments passed to each function.
 */
export interface CloseStackPromiseFactory<GArguments extends unknown[]> {
  (...args: GArguments): unknown;
}
