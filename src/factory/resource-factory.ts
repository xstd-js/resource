import { type Resource } from '../resource/resource.js';
import { type OpenResourceArguments } from './types/open-resource-arguments.js';
import { type OpenResource } from './types/open-resource.js';

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
