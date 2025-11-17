import { type CloseSource } from './close-source.js';

export type ResourceCloseWithInput = CloseSource | readonly (CloseSource | undefined)[];
