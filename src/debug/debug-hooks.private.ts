import { type Resource } from '../resource/resource.ts';

/**
 * How a link between two `Resource`s was created:
 * - `closes-with`: via `Resource#closesWith`
 * - `adopted-by`: via `CloseStack#adoptResource`
 */
export type ResourceLinkType = 'closes-with' | 'adopted-by';

/**
 * A link between two `Resource`s, recorded when it is created by the core.
 */
export interface ResourceLink {
  /** The `Resource` that closes when `to` closes. */
  readonly from: Resource;
  /** The `Resource` whose closure triggers `from`'s closure. */
  readonly to: Resource;
  /** How the link was created. */
  readonly type: ResourceLinkType;
  /** An optional signal that un-binds the link. */
  readonly signal: AbortSignal | undefined;
}

/**
 * A callback invoked whenever a link between two `Resource`s is created.
 */
export type OnResourceLink = (link: ResourceLink) => void;

/**
 * Hooks installed by debug tools (e.g. `enableResourceGraph`).
 *
 * It stays `undefined` unless a debug tool installs itself: consumers who don't
 * opt in pay nothing (a single optional call per link creation), and the debug
 * modules remain tree-shakeable.
 */
export const debugHooks: { onResourceLink: OnResourceLink | undefined } = {
  onResourceLink: undefined,
};
