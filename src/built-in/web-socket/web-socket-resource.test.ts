import { WebSocketData } from '@mswjs/interceptors/WebSocket';
import { WebSocketError } from '@xstd/custom-error';
import {
  type WebSocketHandler,
  type WebSocketHandlerConnection,
  type WebSocketLink,
  ws,
} from 'msw';
import { setupServer, type SetupServerApi } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketResource } from './web-socket-resource.js';

describe('WebSocketResource', () => {
  const chat: WebSocketLink = ws.link('wss://chat.example.com');

  const wsHandlers: readonly WebSocketHandler[] = [
    chat.addEventListener('connection', ({ client }: WebSocketHandlerConnection): void => {
      client.addEventListener('message', (event: MessageEvent<WebSocketData>): void => {
        if (event.data === 'close') {
          client.close();
        }
        client.send(`server->${event.data}`);
      });
    }),
  ];

  const server: SetupServerApi = setupServer(...wsHandlers);

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should open, send, and receive', async () => {
    await using wsr = await WebSocketResource.open('wss://chat.example.com');

    const spy = vi.fn();

    wsr.listen(spy);

    await wsr.send('test');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenNthCalledWith(1, 'server->test');
  });

  describe('constructor', () => {
    it('should throw if a non "open" WebSocket is provided', async () => {
      const ws = new WebSocket('wss://chat.example.com');
      ws.close();
      expect(() => new WebSocketResource(ws)).toThrow();
    });
  });

  describe('state', () => {
    it('should close if the WebSocket closes', async () => {
      await using wsr = await WebSocketResource.open('wss://chat.example.com');

      expect(wsr.closeSignal.aborted).toBe(false);

      await wsr.send('close');

      expect(wsr.closeSignal.aborted).toBe(true);
    });
  });

  describe('methods', () => {
    describe('send', () => {
      it('should be abortable', async () => {
        await using wsr = await WebSocketResource.open('wss://chat.example.com');

        const controller = new AbortController();
        const promise = wsr.send('test', { signal: controller.signal });
        controller.abort();

        expect(promise).rejects.toThrow();

        try {
          await promise;
        } catch (error: unknown) {}
      });
    });

    describe('close', () => {
      it('should close with WebSocketError', async () => {
        await using wsr = await WebSocketResource.open('wss://chat.example.com');
        await wsr.close(new WebSocketError());
      });
    });
  });
});
