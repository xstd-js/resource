import { type Abortable } from '@xstd/abortable';
import { type Resource } from '../../resource/resource.ts';
import { type OpenResourceArguments } from './open-resource-arguments.ts';

/**
 * The _open_ function wrapped by a `ResourceFactory`: it creates a `Resource`
 * from the provided arguments (plus the optional options).
 *
 * @template GArguments - The arguments of the _open_ function.
 * @template GResource - The type of the created `Resource`s.
 * @template GOptions - The options type.
 *
 * @experimental
 */
export interface OpenResource<
  GArguments extends readonly unknown[],
  GResource extends Resource,
  GOptions extends Abortable = Abortable,
> {
  (...args: OpenResourceArguments<GArguments, GOptions>): PromiseLike<GResource> | GResource;
}
