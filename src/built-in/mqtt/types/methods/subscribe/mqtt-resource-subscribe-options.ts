import { type Abortable } from '@xstd/abortable';
import { type MqttSubscriptionResourceOptions } from '../../../subscription/types/mqtt-subscription-resource-options.js';

export interface MqttResourceSubscribeOptions extends MqttSubscriptionResourceOptions, Abortable {}
