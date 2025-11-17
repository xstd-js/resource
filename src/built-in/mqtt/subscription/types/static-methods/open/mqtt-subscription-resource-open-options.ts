import { type Abortable } from '@xstd/abortable';
import { type MqttSubscriptionResourceOptions } from '../../mqtt-subscription-resource-options.js';

export interface MqttSubscriptionResourceOpenOptions
  extends MqttSubscriptionResourceOptions,
    Abortable {}
