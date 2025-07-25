import { topicPatternToRexExp } from './functions.private/topic-pattern-to-rex-exp.js';

export class MqttTopic {
  readonly #value: string;
  readonly #regExp: RegExp; // computed

  constructor(value: string) {
    this.#value = value;
    this.#regExp = topicPatternToRexExp(value);
  }

  get value(): string {
    return this.#value;
  }

  matches(topic: string): boolean {
    this.#regExp.lastIndex = 0;
    return this.#regExp.test(topic);
  }

  toString(): string {
    return this.#value;
  }

  valueOf(): string {
    return this.#value;
  }
}
