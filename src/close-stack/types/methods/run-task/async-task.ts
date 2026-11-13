/**
 * A task executed by `CloseStack.runTask`: called immediately with a signal aborted when
 * the task completes, when the `CloseStack` closes, or when the optional `Abortable`
 * signal provided to `runTask` aborts.
 *
 * @template GReturn - The type returned by the task.
 */
export interface AsyncTask<GReturn> {
  (signal: AbortSignal): PromiseLike<GReturn> | GReturn;
}
