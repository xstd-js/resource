import { type Abortable } from '@xstd/abortable';
import mqtt, { type MqttClient } from 'mqtt';
import { ResourceFactory } from '../../../factory/resource-factory.js';
import { MqttResource } from './mqtt-resource.js';

export interface OpenMqttResourceOptions extends Abortable {
  readonly clientId?: string;
  readonly username?: string;
  readonly password?: string;

  // readonly keepalive?: number;
  // readonly clean?: boolean;
}

export class MqttResourceFactory extends ResourceFactory<
  [url: string | URL, options?: OpenMqttResourceOptions],
  MqttResource
> {
  constructor() {
    super(
      async (
        url: string | URL,
        { signal, ...options }: OpenMqttResourceOptions = {},
      ): Promise<MqttResource> => {
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
      },
    );
  }
}
