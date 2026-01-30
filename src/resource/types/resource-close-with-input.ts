import { type CloseSource } from './close-source.ts';

export type ResourceCloseWithInput = CloseSource | readonly (CloseSource | undefined)[];
