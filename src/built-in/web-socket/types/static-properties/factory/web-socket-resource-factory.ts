import { type ResourceFactory } from '../../../../../factory/resource-factory.js';
import { type WebSocketResource } from '../../../web-socket-resource.js';
import { type WebSocketResourceOpenOptions } from '../../static-methods/open/web-socket-resource-open-options.js';

export type WebSocketResourceFactory = ResourceFactory<
  [url: string | URL],
  WebSocketResource,
  WebSocketResourceOpenOptions
>;
