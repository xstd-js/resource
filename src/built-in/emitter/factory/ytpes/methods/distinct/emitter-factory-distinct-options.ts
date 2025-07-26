import { type EqualFunction } from '@xstd/equal-function';

export interface EmitterFactoryDistinctOptions<GValue> {
  readonly initialValue?: GValue;
  readonly equal?: EqualFunction<GValue>;
}
