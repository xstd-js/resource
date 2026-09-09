/**
 * A function called when the `Resource` closes:
 *   - receives the _close_ `reason`
 *   - may return a `Promise` to support asynchronous resource's disposals
 *
 * Errors thrown or rejected by this function reject the `Resource`'s `closed` Promise
 * (and the Promise returned by `close`); if unobserved, they are reported as unhandled rejections.
 */
export interface OnCloseResource {
  (reason: unknown): PromiseLike<void> | void;
}

export type OptionalOnCloseResource = OnCloseResource | undefined | void;
