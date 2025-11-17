import { type MqttPublishPacket } from '../../mqtt-publish-packet.js';

export interface MqttSubscriptionResourceListener {
  (packet: MqttPublishPacket): void;
}
