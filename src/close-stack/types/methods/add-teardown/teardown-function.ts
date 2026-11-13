/**
 * A cleanup function executed when a `CloseStack` closes.
 *
 * Receives the close `reason` — check for `NormalClosure` to detect a clean shutdown.
 * May return a promise: the close sequence awaits it.
 */
export interface TeardownFunction {
  (reason: unknown): unknown;
}
