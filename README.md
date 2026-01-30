[![npm (scoped)](https://img.shields.io/npm/v/@xstd/resource.svg)](https://www.npmjs.com/package/@xstd/resource)
![npm](https://img.shields.io/npm/dm/@xstd/resource.svg)
![NPM](https://img.shields.io/npm/l/@xstd/resource.svg)
![npm type definitions](https://img.shields.io/npm/types/@xstd/resource.svg)
![coverage](https://img.shields.io/badge/coverage-100%25-green)

<picture>
  <source height="64" media="(prefers-color-scheme: dark)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-dark.png?raw=true">
  <source height="64" media="(prefers-color-scheme: light)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
  <img height="64" alt="Shows a black logo in light color mode and a white one in dark color mode." src="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
</picture>

## @xstd/resource

Objects with lifetime.

## 📦 Installation

```shell
yarn add @xstd/resource
# or
npm install @xstd/resource --save
```

## 📜 Documentation

https://xstd-js.github.io/resource

### Resource

```ts
/**
 * A `Resource` is an abstract entity representing something **live** that needs to be cleaned up when it's no longer necessary.
 *
 * As an example, a _file handle_ or a _database connection_ are illustrations of live resources that must be closed when no longer required to avoid resource leaks.
 *
 * This class provides a common interface for managing these resources.
 */
declare class Resource implements AsyncDisposable {
  /**
   * Creates a new `Resource` instance.
   *
   * @param close - An optional function that will be called when the `Resource` is closed.
   *                This function can be used to perform cleanup or release underlying resources.
   */
  constructor(close?: OnCloseResource);
  
  /**
   * Ensures the `Resource` is open. Throws an error if the resource is closing or closed.
   *
   * @throws {Error} If the resource is closing or closed.
   */
  throwIfClosed(): void;
  
  /**
   * Returns an AbortSignal that is _aborted_ when the `Resource` is closing or closed.
   * This signal can be used to handle cancellation logic based on the resource's lifecycle.
   *
   * @returns {AbortSignal} The `AbortSignal` associated with the resource.
   */
  get closeSignal(): AbortSignal;
  
  /**
   * Returns a Promise that resolves when the `Resource` has been fully closed.
   * This can be used to wait for the completion of the closing operation.
   *
   * @returns {Promise<void>} A Promise that resolves when the resource is closed.
   */
  get closed(): Promise<void>;
  
  /**
   * Closes the `Resource`, optionally providing a reason for the closure.
   * If a _closure function_ was provided during construction, it will be invoked.
   *
   * @param {unknown} [reason] - An optional argument describing why the resource is being closed.
   * @returns {Promise<void>} A Promise that resolves when the resource is fully closed.
   */
  close(reason?: unknown): Promise<void>;
  
  /**
   * Implements the asynchronous disposal protocol.
   * Automatically closes the `Resource` when it goes out of scope or is used with `await using`.
   *
   * @returns {Promise<void>} A Promise that resolves when the resource is closed.
   */
  [Symbol.asyncDispose](): Promise<void>;
  /**
   * Configures the `Resource` to close in response to one or more `CloseSource` instances.
   * `CloseSource` can be another `Resource` or an `AbortSignal`.
   *
   * @param {ResourceCloseWithInput} closeSources - A list of sources that will trigger the resource's closure.
   *                                                These can include `Resource` instances or `AbortSignal` objects.
   * @param {Abortable} [options] - An optional `AbortSignal` to undo the bind.
   * @returns {this} The current `Resource` instance for method chaining.
   */
  closesWith(closeSources: ResourceCloseWithInput, { signal }?: Abortable): this;
}
```

### Resource

```ts
/**
 * Manages async operations in the context of a `CloseSource`.
 */
declare class CloseStack {
  
  /**
   * Executes an iterable of asynchronous or synchronous functions **sequentially**, passing the provided arguments to each function.
   * If any of the functions throw an error, subsequent functions will still be executed, and,
   * at the end, these errors are aggregated into a chain of `SuppressedError` where the last one is thrown.
   *
   * @param {Iterable<CloseStackPromiseFactory<GArguments>} promiseFactories - An iterable containing functions that return a promise or any value.
   *                                                                           These functions will be executed sequentially.
   * @param {...GArguments} args - Arguments to be passed to each function in the iterable.
   * @return {Promise<void>} A promise that resolves when all functions have been executed, or rejects if any errors occur during execution.
   */
  static sequentially<GArguments extends unknown[]>(promiseFactories: Iterable<CloseStackPromiseFactory<GArguments>>, ...args: GArguments): Promise<void>;
  
  /**
   * Executes an iterable of asynchronous or synchronous functions **concurrently**, passing the provided arguments to each function.
   * If any of the functions throw an error, other functions will still be executed, and,
   * at the end, these errors are aggregated and thrown into a single `AggregateError` (note: if only one error is thrown, it will be thrown directly, without being wrapped in an `AggregateError`).
   *
   * @param {Iterable<CloseStackPromiseFactory<GArguments>} promiseFactories - An iterable containing functions that return a promise or any value.
   *                                                                           These functions will be executed concurrently.
   * @param {...GArguments} args - Arguments to be passed to each function in the iterable.
   * @return {Promise<void>} A promise that resolves when all functions have been executed, or rejects if any errors occur during execution.
   */
  static concurrently<GArguments extends unknown[]>(promiseFactories: Iterable<CloseStackPromiseFactory<GArguments>>, ...args: GArguments): Promise<void>;
  
  /**
   * Creates a new instance of `CloseStack`.
   *
   * @param {CloseSource} closeSource - The source providing the close signal, either an `AbortSignal` or a `Resource`.
   */
  constructor(closeSource: CloseSource);
  
  /**
   * Throws an error if the CloseStack is closing or closed.
   *
   * @throws {Error} If closing or closed.
   */
  throwIfClosed(): void;
  
  /**
   * Runs a task linked to this CloseStack's lifecycle:
   *
   * - this "task" function is immediately called, and receives a signal aborted when: the task completes, this CloseStack closes, or the provided `signal` from `Abortable` aborts.
   * - the task is added to a list of pending tasks: when this `CloseStack` closes, the returned promise will await the completion (fulfilled or rejected) of all tasks before resolving.
   *
   * @template GReturn - The return type of the task.
   * @param {AsyncTask<GReturn> | PromiseLike<GReturn>} task - The asynchronous task or a promise to execute.
   * @param signal - Optional abortable signal for cancellation.
   * @returns {Promise<GReturn>} A promise resolving with the task's result.
   * @throws {Error} If the CloseStack is closing or closed, the provided `signal` aborted, or if the task rejects.
   */
  runTask<GReturn>(task: AsyncTask<GReturn> | PromiseLike<GReturn>, { signal }?: Abortable): Promise<GReturn>;
  
  /**
   * Adds a teardown function to be executed when this CloseStack closes.
   *
   * When closing, with mode:
   * - `sequential` teardowns are executed sequentially, in reverse order of addition.
   * - `concurrent` teardowns are executed concurrently.
   *
   * @param {TeardownFunction} teardown - The teardown function to execute.
   * @param mode - The execution mode (`sequential` or `concurrent`).
   * @param signal - Optional abortable signal to remove the teardown.
   */
  addTeardown(teardown: TeardownFunction, { mode, signal }?: AddTeardownOptions): void;
  
  /**
   * Adopts a `Resource` to associate its lifecycle with this CloseStack.
   *
   * @template GResource - The type of the resource.
   * @param {GResource} resource - The resource to adopt.
   * @param signal - Optional abortable signal to remove the adoption.
   * @returns {GResource} The adopted resource for chaining.
   */
  adoptResource<GResource extends Resource>(resource: GResource, { signal }?: Abortable): GResource;
  
  /**
   * Registers an event listener on a specified `EventTarget`, until this CloseStack closes.
   *
   * @template GEvent The type of the event object.
   * @param {EventTarget} target - The target to attach the event listener to.
   * @param {string} type A string representing the event type to listen for (e.g., 'click', 'keydown').
   * @param {(event: GEvent) => void} listener A callback function that will be invoked when the event occurs.
   * @param {AddEventListenerOptions} [options] An optional parameter containing configuration options for the event listener, such as `capture`, `once`, and `passive`.
   *                                            It also supports an additional `signal` option for aborting the listener.
   * @return {void} This method does not return any value.
   */
  addEventListener<GEvent>(target: EventTarget, type: string, listener: (event: GEvent) => void, options?: AddEventListenerOptions): void;
  
  /**
   * Closes this CloseStack, and ensures all tasks and teardown functions are executed in proper cleanup order:
   *
   * 1) awaits that all pending tasks are complete
   * 2) awaits concurrently all `concurrent` teardowns
   * 3) awaits sequentially in reverse order all `sequential` teardowns
   *
   * @param {unknown} reason - The reason for closing the Resource.
   * @returns {Promise<void>} A promise that resolves once all teardowns and tasks are handled.
   * @throws {Error} If called outside the context of the Resource's `close` function, or if it is already closed.
   */
  close(reason: unknown): Promise<void>;
}
```
