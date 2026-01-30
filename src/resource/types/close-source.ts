import { type Resource } from '../resource.ts';

/**
 * Something that can be used to close a resource.
 */
export type CloseSource = Resource | AbortSignal;
