import { type EmitterResource } from '../../../emitter-resource.js';
import { type DispatchValue } from '../../dispatch-value.js';

/**
 * An `EmitterResource` with its associated `dispatch` function.
 */
export interface EmitterResourceWithDispatcher<GValue> {
  readonly emitter: EmitterResource<GValue>;
  readonly dispatch: DispatchValue<GValue>;
}
