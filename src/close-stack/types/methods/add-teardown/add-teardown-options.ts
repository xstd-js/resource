import { type Abortable } from '@xstd/abortable';

/**
 * Options for `CloseStack.addTeardown`.
 *
 * The `signal` inherited from `Abortable` un-registers the teardown when it aborts
 * (before it runs).
 */
export interface AddTeardownOptions extends Abortable {
  /**
   * The execution mode when the `CloseStack` closes:
   * - `sequential` (default): executed in reverse order of addition
   * - `concurrent`: executed concurrently with the other `concurrent` teardowns
   */
  readonly mode?: 'sequential' | 'concurrent';
}
