import { type Abortable } from '@xstd/abortable';
import { type ISubscriptionGrant, type MqttClient } from 'mqtt';

export interface SubscribeToMqttClientSubscriptionOptions extends Abortable {
  readonly qos?: 0 | 1 | 2;
  readonly noLocal?: boolean;
  readonly retainAsPublished?: boolean;
  readonly retainHandling?: 0 | 1 | 2;
}

export async function subscribeToMqttClientSubscription(
  client: MqttClient,
  topic: string,
  {
    qos = 0,
    noLocal = false,
    retainAsPublished = false,
    retainHandling = 0,
    signal,
  }: SubscribeToMqttClientSubscriptionOptions = {},
): Promise<void> {
  const [granted]: readonly ISubscriptionGrant[] = await client.subscribeAsync(topic, {
    qos,
    nl: noLocal,
    rap: retainAsPublished,
    rh: retainHandling,
  });

  if (signal?.aborted) {
    await client.unsubscribeAsync(topic);
    throw signal.reason;
  }

  if (qos !== undefined && granted.qos < qos) {
    await client.unsubscribeAsync(topic);
    throw new Error(`Cannot subscribe to "${topic}" with a qos of ${qos}. Granted ${granted.qos}.`);
  }
}
