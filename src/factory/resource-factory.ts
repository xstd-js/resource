import { type Abortable } from '@xstd/abortable';
import { type Resource } from '../resource/resource.ts';
import { type OpenResourceArguments } from './types/open-resource-arguments.ts';
import { type OpenResource } from './types/open-resource.ts';

/**
 * Creates `Resource` instances from arguments.
 *
 * Wraps an _open_ function and exposes it through `open`, which forwards the
 * provided arguments (and the optional options) to it.
 *
 * @template GArguments - The arguments of the _open_ function.
 * @template GResource - The type of the created `Resource`s.
 * @template GOptions - The options type, extending `Abortable`.
 *
 * @experimental
 */
export class ResourceFactory<
  GArguments extends readonly unknown[],
  GResource extends Resource,
  GOptions extends Abortable = Abortable,
> {
  readonly #open: OpenResource<GArguments, GResource, GOptions>;

  /**
   * Creates a new `ResourceFactory`.
   *
   * @param {OpenResource<GArguments, GResource, GOptions>} open - The _open_ function invoked by `open`.
   */
  constructor(open: OpenResource<GArguments, GResource, GOptions>) {
    this.#open = open;
  }

  /**
   * Opens a new `Resource` by invoking the _open_ function with the provided arguments.
   *
   * @param {...OpenResourceArguments<GArguments, GOptions>} args - The arguments forwarded to the _open_ function.
   * @returns {Promise<GResource>} A promise resolving with the created `Resource`.
   */
  open(...args: OpenResourceArguments<GArguments, GOptions>): Promise<GResource> {
    return Promise.try(this.#open, ...args);
  }
}
