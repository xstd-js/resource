import { type Abortable } from '@xstd/abortable';

export interface WebSocketResourceOpenOptions extends Abortable {
  readonly protocols?: string | readonly string[];
}
