import { type Abortable } from '@xstd/abortable';
import { WebSocketError } from '@xstd/custom-error';
import { ResourceFactory } from '../../factory/resource-factory.js';
import { WebSocketResource } from './web-socket-resource.js';

export interface OpenWebSocketResourceOptions extends Abortable {
  readonly protocols?: string | readonly string[];
}

export class WebSocketResourceFactory extends ResourceFactory<
  [url: string | URL, options?: OpenWebSocketResourceOptions],
  WebSocketResource
> {
  constructor() {
    super(
      (
        url: string | URL,
        { protocols, signal }: OpenWebSocketResourceOptions = {},
      ): Promise<WebSocketResource> => {
        return new Promise(
          (
            _resolve: (value: WebSocketResource) => void,
            _reject: (error: unknown) => void,
          ): void => {
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
  }
}
