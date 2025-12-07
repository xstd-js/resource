export interface AsyncTask<GReturn> {
  (signal: AbortSignal): PromiseLike<GReturn> | GReturn;
}
