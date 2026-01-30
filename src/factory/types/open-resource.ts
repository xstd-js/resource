import { type Abortable } from '@xstd/abortable';
import { type Resource } from '../../resource/resource.ts';
import { type OpenResourceArguments } from './open-resource-arguments.ts';

/**
 * @experimental
 */
export interface OpenResource<
  GArguments extends readonly any[],
  GResource extends Resource,
  GOptions extends Abortable = Abortable,
> {
  (...args: OpenResourceArguments<GArguments, GOptions>): PromiseLike<GResource> | GResource;
}
