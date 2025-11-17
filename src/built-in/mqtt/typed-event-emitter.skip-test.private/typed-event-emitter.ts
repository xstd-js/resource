import { type EventHandler } from './event-handler.js';

export interface TypedEventEmitter<TEvents extends Record<keyof TEvents, EventHandler>> {
  on<TEvent extends keyof TEvents>(event: TEvent, callback: TEvents[TEvent]): this;
  off<TEvent extends keyof TEvents>(event: TEvent, callback: TEvents[TEvent]): this;
}
