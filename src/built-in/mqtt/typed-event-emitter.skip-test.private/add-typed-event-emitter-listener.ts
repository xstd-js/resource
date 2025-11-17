import { type EventHandler } from './event-handler.js';
import { type TypedEventEmitter } from './typed-event-emitter.js';

export function addTypedEventEmitterListener<
  TEvents extends Record<keyof TEvents, EventHandler>,
  TEvent extends keyof TEvents,
>(
  target: TypedEventEmitter<TEvents>,
  event: TEvent,
  callback: TEvents[TEvent],
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    return;
  }
  target.on<TEvent>(event, callback);

  signal.addEventListener('abort', (): void => {
    target.off<TEvent>(event, callback);
  });
}
