import { type Abortable } from '@xstd/abortable';
import { type Resource } from '../resource.js';

export interface OpenResource<GArguments extends readonly any[], GResource extends Resource> {
  (...args: GArguments): PromiseLike<GResource> | GResource;
}

export type OpenResourceArguments<GArguments extends readonly any[]> =
  [...GArguments] extends readonly [...args: infer GArgs, last?: infer GLast] ?
    GLast extends Abortable ?
      GArguments
    : [...args: GArgs, options?: Abortable]
  : never;

export class ResourceFactory<
  GArguments extends OpenResourceArguments<GArguments>,
  GResource extends Resource,
> {
  readonly #open: OpenResource<GArguments, GResource>;

  constructor(open: OpenResource<GArguments, GResource>) {
    this.#open = open;
  }

  open(...args: GArguments): Promise<GResource> {
    return Promise.try(this.#open, ...args);
  }
}
