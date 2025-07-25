import { type OnCloseResource, Resource } from '../../resource/resource.js';

export class DataResource<GData> extends Resource {
  readonly #data: GData;

  constructor(data: GData, close?: OnCloseResource) {
    super(close);
    this.#data = data;
  }

  get data(): GData {
    return this.#data;
  }
}
