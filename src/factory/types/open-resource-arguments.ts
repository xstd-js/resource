import { type Abortable } from '@xstd/abortable';

export type OpenResourceArguments<GArguments extends readonly any[]> = [
  ...GArguments,
] extends readonly [...args: infer GArgs, last?: infer GLast]
  ? GLast extends Abortable
    ? GArguments
    : [...args: GArgs, options?: Abortable]
  : never;
