import { type Abortable, abortify } from '@xstd/abortable';
import { CompleteError } from '@xstd/custom-error';
import mqtt, { type IDisconnectPacket, type MqttClient } from 'mqtt';
import { CloseStack } from '../../manager/close-stack.js';
import { Resource } from '../../resource/resource.js';
import { MqttSubscriptionResource } from './subscription/mqtt-subscription-resource.js';
import { type MqttResourceSubscribeOptions } from './types/methods/subscribe/mqtt-resource-subscribe-options.js';

/* OPEN */

export interface OpenMqttResourceOptions extends Abortable {
  readonly clientId?: string;
  readonly username?: string;
  readonly password?: string;

  // readonly keepalive?: number;
  // readonly clean?: boolean;
}

/* CLASS */

export class MqttResource extends Resource {
  static async open(
    url: string | URL,
    { signal, ...options }: OpenMqttResourceOptions = {},
  ): Promise<MqttResource> {
    signal?.throwIfAborted();

    const client: MqttClient = await mqtt.connectAsync(url.toString(), {
      ...options,
      reconnectPeriod: 0,
      autoUseTopicAlias: true,
      autoAssignTopicAlias: true,
    });

    // TODO
    client.setMaxListeners(20);
    // client.setMaxListeners(50);

    if (signal?.aborted) {
      await client.endAsync();
      throw signal.reason;
    }

    return new MqttResource(client);
  }

  readonly #client: MqttClient;
  readonly #manager: CloseStack;

  constructor(client: MqttClient) {
    super((reason: unknown): Promise<void> => {
      return this.#manager.close(reason);
    });

    this.#client = client;

    if (!this.#client.connected) {
      throw new Error('MqttClient not open.');
    }

    const onClientDisconnect = (packet: IDisconnectPacket): void => {
      if (packet.reasonCode === undefined || packet.reasonCode === 0x00) {
        void this.close(new CompleteError());
      } else {
        void this.close(new Error('Disconnected', { cause: packet }));
      }
    };

    const onClientError = (error: unknown): void => {
      void this.close(error);
    };

    const onClientEnd = (): void => {
      void this.close(new Error('Client ended'));
    };

    this.#client.on('disconnect', onClientDisconnect);
    this.#client.on('error', onClientError);
    this.#client.on('end', onClientEnd);

    this.closeSignal.addEventListener(
      'abort',
      (): void => {
        this.#client.off('disconnect', onClientDisconnect);
        this.#client.off('error', onClientError);
        this.#client.off('end', onClientEnd);
      },
      {
        once: true,
      },
    );

    this.#manager = new CloseStack(this);

    this.#manager.addTeardown((): Promise<void> => {
      return this.#client.endAsync();
    });
  }

  publish(
    topic: string,
    payload: string | Uint8Array,
    { signal, ...options }: MqttResourcePublishOptions = {},
  ): Promise<void> {
    return this.#manager.runTask(
      async (signal: AbortSignal): Promise<void> => {
        await abortify(this.#client.publishAsync(topic, payload as any, options), {
          signal,
        });
      },
      { signal },
    );
  }

  subscription(
    topic: string,
    { signal, ...options }: MqttResourceSubscribeOptions = {},
  ): Promise<MqttSubscriptionResource> {
    return this.#manager.runTask(
      async (signal: AbortSignal): Promise<MqttSubscriptionResource> => {
        return this.#manager.adopt(
          await MqttSubscriptionResource.open(this.#client, topic, {
            ...options,
            signal,
          }),
        );
      },
      { signal },
    );
  }
}

/* METHODS */

// PUBLISH

export interface MqttResourcePublishOptions extends Abortable {
  readonly qos?: 0 | 1 | 2;
  readonly retain?: boolean;
  readonly dup?: boolean;
}
