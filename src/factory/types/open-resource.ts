import { type Abortable } from '@xstd/abortable';
import { type Resource } from '../../resource/resource.js';
import { type OpenResourceArguments } from './open-resource-arguments.js';

export interface OpenResource<
  GArguments extends readonly any[],
  GResource extends Resource,
  GOptions extends Abortable = Abortable,
> {
  (...args: OpenResourceArguments<GArguments, GOptions>): PromiseLike<GResource> | GResource;
}
