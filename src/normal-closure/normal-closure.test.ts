import { describe, expect, it } from 'vitest';
import { NormalClosure } from './normal-closure.ts';

describe('NormalClosure', () => {
  describe('constructor', () => {
    it('should use the default message when no argument is provided', () => {
      const error = new NormalClosure();

      expect(error).toBeInstanceOf(NormalClosure);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NormalClosure');
      expect(error.message).toBe('Resource closed normally');
      expect(error.cause).toBe(undefined);
      expect(error.stack).toBeTruthy();
    });

    it('should accept a custom message', () => {
      const error = new NormalClosure('Socket closed');

      expect(error.message).toBe('Socket closed');
      expect(error.name).toBe('NormalClosure');
    });

    it('should accept a custom message with options', () => {
      const cause = new Error('origin');
      const error = new NormalClosure('Socket closed', { cause });

      expect(error.message).toBe('Socket closed');
      expect(error.cause).toBe(cause);
    });

    it('should accept options with the default message', () => {
      const cause = new Error('origin');
      const error = new NormalClosure({ cause });

      expect(error.message).toBe('Resource closed normally');
      expect(error.cause).toBe(cause);
    });
  });
});
