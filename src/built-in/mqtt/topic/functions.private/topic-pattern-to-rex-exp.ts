import { topicPatternToRexExpPattern } from './topic-pattern-to-rex-exp-pattern.js';

export function topicPatternToRexExp(topicPattern: string): RegExp {
  return new RegExp(topicPatternToRexExpPattern(topicPattern), '');
}
