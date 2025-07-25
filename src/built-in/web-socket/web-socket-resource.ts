import { sleep } from '@xstd/abortable';
import { WebSocketError } from '@xstd/custom-error';
import { ResourceManager } from '../../resource/helpers/resource-manager.js';
import { Resource } from '../../resource/resource.js';
import { EmitterFactory } from '../emitter/emitter-factory.js';
import { DispatchValue, EmitterResource } from '../emitter/emitter-resource.js';
import { type WebSocketDownValue } from './types/web-socket-down-value.js';
import { type WebSocketUpValue } from './types/web-socket-up-value.js';
import {
  type OpenWebSocketResourceOptions,
  WebSocketResourceFactory,
} from './web-socket-resource-factory.js';

export class WebSocketResource extends Resource {
  static #factory: WebSocketResourceFactory;

  static open(
    url: string | URL,
    options?: OpenWebSocketResourceOptions,
  ): Promise<WebSocketResource> {
    if (this.#factory === undefined) {
      this.#factory = new WebSocketResourceFactory();
    }

    return this.#factory.open(url, options);
  }

  readonly #webSocket: WebSocket;
  readonly #manager: ResourceManager;
  readonly #receiver: EmitterFactory<WebSocketDownValue>;

  constructor(webSocket: WebSocket) {
    super((reason: unknown): Promise<void> => {
      return this.#manager.close(reason);
    });

    this.#webSocket = webSocket;

    if (this.#webSocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open.');
    }

    // close this resource when the webSocket closes
    this.#webSocket.addEventListener(
      'close',
      (event: CloseEvent): void => {
        void this.close(WebSocketError.fromCloseEvent(event));
      },
      {
        signal: this.closeSignal,
      },
    );

    // close this resource when the webSocket errors
    this.#webSocket.addEventListener(
      'error',
      (): void => {
        void this.close(new WebSocketError());
      },
      {
        signal: this.closeSignal,
      },
    );

    this.#manager = new ResourceManager(this);

    this.#manager.addTeardown((reason: unknown): void => {
      if (
        this.#webSocket.readyState === WebSocket.CONNECTING ||
        this.#webSocket.readyState === WebSocket.OPEN
      ) {
        // TODO await buffer flushed ?
        if (reason instanceof WebSocketError) {
          this.#webSocket.close(reason.code, reason.reason);
        } else {
          this.#webSocket.close();
        }
      }
    });

    this.#receiver = new EmitterFactory<WebSocketDownValue>(
      (): EmitterResource<WebSocketDownValue> => {
        const controller: AbortController = new AbortController();
        return new EmitterResource<WebSocketDownValue>(
          (dispatch: DispatchValue<WebSocketDownValue>): void => {
            this.#webSocket.addEventListener(
              'message',
              (event: MessageEvent<WebSocketDownValue>): void => {
                dispatch(event.data);
              },
              controller,
            );
          },
          (reason: unknown): void => {
            controller.abort(reason);
          },
        ).closesWith(this);
      },
    );
  }

  async send(payload: WebSocketUpValue): Promise<void> {
    return this.#manager.runTask(async (signal: AbortSignal): Promise<void> => {
      this.#webSocket.send(payload);

      while (this.#webSocket.bufferedAmount > 0) {
        if (
          this.#webSocket.readyState === WebSocket.CLOSING ||
          this.#webSocket.readyState === WebSocket.CLOSED
        ) {
          throw new Error(
            `WebSocket ${this.#webSocket.readyState === WebSocket.CLOSING ? 'closing' : 'closed'}.`,
          );
        }
        await sleep(0, { signal });
      }
    });
  }

  get receiver(): EmitterFactory<WebSocketDownValue> {
    return this.#receiver;
  }
}
