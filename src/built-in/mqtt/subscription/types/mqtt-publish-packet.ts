export interface MqttPublishPacket {
  readonly topic: string;
  readonly payload: Uint8Array;
}
