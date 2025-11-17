import { type RefCountResourceFactoryOptionsForConsumer } from '../../../ref-count/ref-count-resource-factory.js';

export interface MqttSubscriptionResourceOptions extends RefCountResourceFactoryOptionsForConsumer {
  readonly qos?: 0 | 1 | 2;
  readonly noLocal?: boolean;
  readonly retainAsPublished?: boolean;
  readonly retainHandling?: 0 | 1 | 2;
}
