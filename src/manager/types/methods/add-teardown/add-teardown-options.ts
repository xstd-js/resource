import { type Abortable } from '@xstd/abortable';

export interface AddTeardownOptions extends Abortable {
  readonly mode?: 'sequential' | 'concurrent';
}
