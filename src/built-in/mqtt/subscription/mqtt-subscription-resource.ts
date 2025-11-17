import { type Abortable, mergeAbortSignals } from '@xstd/abortable';
import { MqttTopic } from '@xstd/mqtt-topic';
import { type IPublishPacket, type MqttClient } from 'mqtt';
import { ResourceFactory } from '../../../factory/resource-factory.js';
import { Resource } from '../../../resource/resource.js';
import {
  CloseRefCountResource,
  RefCountResourceFactory,
} from '../../ref-count/ref-count-resource-factory.js';
import { subscribeToMqttClientSubscription } from './functions.private/subscribe-to-mqtt-client-subscription.js';
import { type MqttSubscriptionResourceListener } from './types/methods/listen/mqtt-subscription-resource-listener.js';
import { type MqttSubscriptionResourceOpenOptions } from './types/static-methods/open/mqtt-subscription-resource-open-options.js';
import { type MqttSubscriptionResourceFactory } from './types/static-properties/factory/mqtt-subscription-resource-factory.js';

/* INTERNAL TYPES */

interface ActiveSubscription {
  readonly qos: 0 | 1 | 2;
  readonly noLocal: boolean;
  readonly retainAsPublished: boolean;
  readonly retainHandling: 0 | 1 | 2;

  readonly factory: RefCountResourceFactory<Resource, MqttSubscriptionResource>;
}

/* CLASS */

export class MqttSubscriptionResource extends Resource {
  static #activeSubscriptions = new WeakMap<
    MqttClient,
    Map<string /* topic */, ActiveSubscription>
  >();

  static readonly #factory: MqttSubscriptionResourceFactory = new ResourceFactory<
    [client: MqttClient, topic: string],
    MqttSubscriptionResource,
    MqttSubscriptionResourceOpenOptions
  >(
    async (
      client: MqttClient,
      topic: string,
      {
        qos = 0,
        noLocal = false,
        retainAsPublished = false,
        retainHandling = 0,
        maintainAlive,
        signal,
      }: MqttSubscriptionResourceOpenOptions = {},
    ): Promise<MqttSubscriptionResource> => {
      signal?.throwIfAborted();

      let activeSubscriptions: Map<string, ActiveSubscription> | undefined =
        this.#activeSubscriptions.get(client);

      if (activeSubscriptions === undefined) {
        activeSubscriptions = new Map<string, ActiveSubscription>();
        this.#activeSubscriptions.set(client, activeSubscriptions);
      }

      let activeSubscription: ActiveSubscription | undefined = activeSubscriptions.get(topic);

      if (activeSubscription === undefined) {
        activeSubscription = {
          qos,
          noLocal,
          retainAsPublished,
          retainHandling,
          factory: new RefCountResourceFactory<Resource, MqttSubscriptionResource>({
            open: async ({ signal }: Abortable = {}): Promise<Resource> => {
              await subscribeToMqttClientSubscription(client, topic, {
                qos,
                noLocal,
                retainAsPublished,
                retainHandling,
                signal,
              });

              return new Resource(async (): Promise<void> => {
                try {
                  await client.unsubscribeAsync(topic);
                } finally {
                  activeSubscriptions.delete(topic);
                  if (activeSubscriptions.size === 0) {
                    this.#activeSubscriptions.delete(client);
                  }
                }
              });
            },
            create: (
              sharedResource: Resource,
              close: CloseRefCountResource,
            ): MqttSubscriptionResource => {
              return new MqttSubscriptionResource(client, topic, close).closesWith(sharedResource);
            },
            maintainAlive,
          }),
        };

        activeSubscriptions.set(topic, activeSubscription);
      } else if (
        activeSubscription.qos !== qos ||
        activeSubscription.noLocal !== noLocal ||
        activeSubscription.retainAsPublished !== retainAsPublished ||
        activeSubscription.retainHandling !== retainHandling
      ) {
        throw new Error(`Subscription to "${topic}" already locked.`);
      }

      return activeSubscription!.factory.open({ signal });
    },
  );

  static get factory(): MqttSubscriptionResourceFactory {
    return this.#factory;
  }

  static open(
    client: MqttClient,
    topic: string,
    options?: MqttSubscriptionResourceOpenOptions,
  ): Promise<MqttSubscriptionResource> {
    return this.#factory.open(client, topic, options);
  }

  readonly #client: MqttClient;
  readonly #topic: MqttTopic;

  protected constructor(client: MqttClient, topic: string, close: CloseRefCountResource) {
    super(close);

    this.#client = client;
    this.#topic = new MqttTopic(topic);
  }

  listen(listener: MqttSubscriptionResourceListener, { signal }: Abortable = {}): void {
    if (signal?.aborted) {
      throw signal.reason;
    }

    this.throwIfClosed();

    const onClientMessage = (topic: string, payload: Buffer, _packet: IPublishPacket): void => {
      if (this.#topic.matches(topic)) {
        listener({
          topic,
          payload,
        });
      }
    };

    this.#client.on('message', onClientMessage);

    mergeAbortSignals([this.closeSignal, signal]).addEventListener(
      'abort',
      (): void => {
        this.#client.off('message', onClientMessage);
      },
      { once: true },
    );
  }
}
