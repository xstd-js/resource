export interface CloseStackPromiseFactory<GArguments extends unknown[]> {
  (...args: GArguments): PromiseLike<any> | any;
}
