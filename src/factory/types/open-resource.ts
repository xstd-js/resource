import { type Resource } from '../../resource/resource.js';

export interface OpenResource<GArguments extends readonly any[], GResource extends Resource> {
  (...args: GArguments): PromiseLike<GResource> | GResource;
}
