/**
 * A function called when the `Resource` closes:
 *   - receives the _close_ `reason`
 *   - may return a `Promise` to support asynchronous resource's disposals
 */
export interface OnCloseResource {
  (reason: unknown): PromiseLike<void> | void;
}

export type OptionalOnCloseResource = OnCloseResource | undefined | void;
