import { type DispatchValue } from '../dispatch-value.js';

export interface InitEmitterResource<GValue> {
  (dispatch: DispatchValue<GValue>): void;
}
