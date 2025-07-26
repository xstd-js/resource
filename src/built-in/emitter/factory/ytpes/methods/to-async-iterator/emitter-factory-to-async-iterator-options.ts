import { type Abortable } from '@xstd/abortable';

export interface EmitterFactoryToAsyncIteratorOptions extends Abortable {
  readonly bufferSize?: number;
  readonly windowTime?: number;
}
