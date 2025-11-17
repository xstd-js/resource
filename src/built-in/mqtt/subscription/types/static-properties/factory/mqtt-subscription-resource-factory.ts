import { type MqttClient } from 'mqtt';
import { type ResourceFactory } from '../../../../../../factory/resource-factory.js';
import { type MqttSubscriptionResource } from '../../../mqtt-subscription-resource.js';
import { type MqttSubscriptionResourceOpenOptions } from '../../static-methods/open/mqtt-subscription-resource-open-options.js';

export type MqttSubscriptionResourceFactory = ResourceFactory<
  [client: MqttClient, topic: string],
  MqttSubscriptionResource,
  MqttSubscriptionResourceOpenOptions
>;
