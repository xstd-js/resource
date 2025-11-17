import { type Abortable } from '@xstd/abortable';
import { type Resource } from '../resource/resource.js';
import { type OpenResourceArguments } from './types/open-resource-arguments.js';
import { type OpenResource } from './types/open-resource.js';

export class ResourceFactory<
  GArguments extends readonly unknown[],
  GResource extends Resource,
  GOptions extends Abortable = Abortable,
> {
  readonly #open: OpenResource<GArguments, GResource, GOptions>;

  constructor(open: OpenResource<GArguments, GResource, GOptions>) {
    this.#open = open;
  }

  open(...args: OpenResourceArguments<GArguments, GOptions>): Promise<GResource> {
    return Promise.try(this.#open, ...args);
  }
}
