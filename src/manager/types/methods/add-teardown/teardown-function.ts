export interface TeardownFunction {
  (reason: unknown): PromiseLike<any> | any;
}
