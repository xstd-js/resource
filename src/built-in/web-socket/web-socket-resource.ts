import { type Abortable, mergeAbortSignals, sleep } from '@xstd/abortable';
import { WebSocketError } from '@xstd/custom-error';
import { ResourceFactory } from '../../factory/resource-factory.js';
import { CloseStack } from '../../manager/close-stack.js';
import { Resource } from '../../resource/resource.js';
import { type WebSocketResourceListener } from './types/methods/listen/web-socket-resource-listener.js';
import { type WebSocketResourceOpenOptions } from './types/static-methods/open/web-socket-resource-open-options.js';
import { type WebSocketResourceFactory } from './types/static-properties/factory/web-socket-resource-factory.js';
import { type WebSocketDownValue } from './types/web-socket-down-value.js';
import { type WebSocketUpValue } from './types/web-socket-up-value.js';

export class WebSocketResource extends Resource {
  static readonly #factory: WebSocketResourceFactory = new ResourceFactory<
    [url: string | URL],
    WebSocketResource,
    WebSocketResourceOpenOptions
  >(
    (
      url: string | URL,
      { protocols, signal }: WebSocketResourceOpenOptions = {},
    ): Promise<WebSocketResource> => {
      return new Promise(
        (_resolve: (value: WebSocketResource) => void, _reject: (error: unknown) => void): void => {
          signal?.throwIfAborted();

          const end = (): void => {
            signal?.removeEventListener('abort', onAbort);
            webSocket.removeEventListener('open', onOpen);
            webSocket.removeEventListener('close', onClose);
            webSocket.removeEventListener('error', onError);
          };

          const resolve = (value: WebSocketResource): void => {
            end();
            _resolve(value);
          };

          const reject = (error: unknown): void => {
            end();
            _reject(error);
          };

          const onAbort = (): void => {
            end();
            reject(signal!.reason);
          };

          const onOpen = (): void => {
            end();
            resolve(new WebSocketResource(webSocket));
          };

          const onClose = (event: CloseEvent): void => {
            end();
            reject(WebSocketError.fromCloseEvent(event));
          };

          const onError = (): void => {
            end();
            reject(new WebSocketError());
          };

          const webSocket: WebSocket = new WebSocket(url, protocols as string[]);
          webSocket.binaryType = 'arraybuffer';

          signal?.addEventListener('abort', onAbort);
          webSocket.addEventListener('open', onOpen);
          webSocket.addEventListener('close', onClose);
          webSocket.addEventListener('error', onError);
        },
      );
    },
  );

  static get factory(): WebSocketResourceFactory {
    return this.#factory;
  }

  static open(
    url: string | URL,
    options?: WebSocketResourceOpenOptions,
  ): Promise<WebSocketResource> {
    return this.#factory.open(url, options);
  }

  readonly #webSocket: WebSocket;
  readonly #manager: CloseStack;

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
      /* istanbul ignore next */
      (): void => {
        void this.close(new WebSocketError());
      },
      {
        signal: this.closeSignal,
      },
    );

    this.#manager = new CloseStack(this);

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
  }

  send(payload: WebSocketUpValue, options?: Abortable): Promise<void> {
    return this.#manager.runTask(async (signal: AbortSignal): Promise<void> => {
      this.#webSocket.send(payload);

      while (this.#webSocket.bufferedAmount > 0) {
        try {
          await sleep(0, { signal });
        } catch (error: unknown) {
          // if the Resource closes while we sleep, we throw the error only if send is not complete
          if (options?.signal?.aborted || this.#webSocket.bufferedAmount > 0) {
            throw error;
          }
        }
      }
    }, options);
  }

  listen(listener: WebSocketResourceListener, { signal }: Abortable = {}): void {
    if (signal?.aborted) {
      return;
    }

    this.throwIfClosed();

    this.#webSocket.addEventListener(
      'message',
      (event: MessageEvent<WebSocketDownValue>): void => {
        listener(event.data);
      },
      {
        signal: mergeAbortSignals([this.closeSignal, signal]),
      },
    );
  }
}
