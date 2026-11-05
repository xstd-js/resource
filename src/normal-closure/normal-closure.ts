/**
 * An error signal indicating a normal (expected) resource closure.
 *
 * It's typically provided as the close `reason` of a `Resource` to mark the closure as
 * intentional: consumers and teardown functions can then distinguish a clean shutdown
 * from an abnormal one by checking `reason instanceof NormalClosure`.
 *
 * A `NormalClosure` is also the default close `reason` used by a `Resource` when it's
 * closed without an explicit one (e.g. through `await using` or a reason-less `close`).
 *
 * The name is borrowed from the WebSocket close code `1000` ("Normal Closure").
 *
 * @example
 * ```ts
 * // Closing a resource normally:
 * await resource.close(new NormalClosure());
 *
 * // Detecting a normal closure in a teardown:
 * const teardown = (reason: unknown): void => {
 *   if (reason instanceof NormalClosure) {
 *     console.log('Clean shutdown.');
 *   }
 * };
 * ```
 */
export class NormalClosure extends Error {
  override readonly name: string = 'NormalClosure';

  /**
   * Creates a new `NormalClosure` error signal.
   *
   * @param {string} [message='Resource closed normally'] - A human-readable description of the closure.
   * @param {ErrorOptions} [options] - Options forwarded to the `Error` constructor, e.g. `{ cause }`
   *                                   to chain the reason that triggered the closure, if any.
   */
  constructor(message?: string, options?: ErrorOptions);
  /**
   * Creates a new `NormalClosure` error signal with the default message.
   *
   * @param {ErrorOptions} [options] - Options forwarded to the `Error` constructor, e.g. `{ cause }`
   *                                   to chain the reason that triggered the closure, if any.
   */
  constructor(options?: ErrorOptions);
  constructor(message?: string | ErrorOptions, options?: ErrorOptions) {
    super(
      typeof message === 'string' ? message : 'Resource closed normally',
      message === undefined || typeof message === 'string' ? options : message,
    );
  }
}
