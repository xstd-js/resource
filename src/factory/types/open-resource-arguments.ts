import { type Abortable } from '@xstd/abortable';

/**
 * @experimental
 */
export type OpenResourceArguments<
  GArguments extends readonly unknown[],
  GOptions extends Abortable = Abortable,
> =
  Partial<GOptions> extends GOptions
    ? readonly [...args: GArguments, options?: GOptions]
    : readonly [...args: GArguments, options: GOptions];
