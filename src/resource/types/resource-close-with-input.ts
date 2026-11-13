import { type CloseSource } from './close-source.ts';

/**
 * The close source(s) accepted by `Resource.closesWith`:
 * a single `CloseSource`, or a list of them (`undefined` entries are skipped).
 */
export type ResourceCloseWithInput = CloseSource | readonly (CloseSource | undefined)[];
