import { type WebSocketDownValue } from '../../web-socket-down-value.js';

export interface WebSocketResourceListener {
  (payload: WebSocketDownValue): void;
}
