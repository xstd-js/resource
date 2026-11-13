[![npm (scoped)](https://img.shields.io/npm/v/@xstd/resource.svg)](https://www.npmjs.com/package/@xstd/resource)
![npm](https://img.shields.io/npm/dm/@xstd/resource.svg)
![NPM](https://img.shields.io/npm/l/@xstd/resource.svg)
![npm type definitions](https://img.shields.io/npm/types/@xstd/resource.svg)
![coverage](https://img.shields.io/badge/coverage-100%25-green)
![AI generation](https://img.shields.io/badge/AI_generation-low-yellow)

<picture>
  <source height="64" media="(prefers-color-scheme: dark)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-dark.png?raw=true">
  <source height="64" media="(prefers-color-scheme: light)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
  <img height="64" alt="Shows a black logo in light color mode and a white one in dark color mode." src="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
</picture>

## @xstd/resource

**Objects with lifetime.**

## 📦 Installation

```shell
yarn add @xstd/resource
# or
npm install @xstd/resource --save
```

> [!NOTE]
> Requires a runtime exposing ES2025's `Promise.try` (Node.js 23+ or any recent browser).

## 💡 Overview

This package provides a few building blocks to model _things that live_ — and to signal how their life ends:

- **`Resource`** — represents something **live** (a file handle, a database connection, a subscription, …) that must be cleaned up when it's no longer needed, to avoid resource leaks.
- **`CloseStack`** — groups tasks, teardowns and adopted resources into a single, ordered cleanup sequence, driven by a `CloseSource` (a `Resource` or an `AbortSignal`).
- **`NormalClosure`** — an error signal marking a closure as **normal** (intentional): the default close reason of a `Resource` closed without an explicit one, detectable in cleanup hooks via `reason instanceof NormalClosure`.

They share the same mental model:

- an **`AbortSignal`** (`closeSignal`) is aborted as soon as the closing **starts**,
- a **promise** (`closed`) settles once the cleanup has **fully completed**,
- a **reason** (any value) flows through the whole chain, from `close('...')` to every cleanup hook — when a `Resource` closes without one, a `NormalClosure` signal is used instead.

## 🚀 `Resource`

### Creating a `Resource`

Pass an optional _closure function_: it will be invoked (once) when the resource closes.

```ts
import { Resource } from '@xstd/resource';

const connection: Resource = new Resource(async (): Promise<void> => {
  await client.end(); // release the underlying resource
});
```

### The two phases of closure

A `Resource` exposes both a signal and a promise, matching the two phases of its death:

| Phase                 | Observer                               | Typical use                           |
| --------------------- | -------------------------------------- | ------------------------------------- |
| closing **starts**    | `resource.closeSignal` (`AbortSignal`) | cancel in-flight work, stop listening |
| cleanup **completed** | `resource.closed` (`Promise<void>`)    | wait until it's safe to move on       |

```ts
// the signal plugs anywhere an AbortSignal is expected:
const response: Response = await fetch('https://example.com', {
  signal: connection.closeSignal, // aborted when `connection` closes
});

// the promise resolves once the closure function has completed:
await connection.closed;
```

### Automatic disposal with `await using`

`Resource` implements [`Symbol.asyncDispose`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/asyncDispose): it works natively with `await using` (TypeScript 5.2+, Node 20+).

```ts
import { open } from 'node:fs/promises';
import { Resource } from '@xstd/resource';

async function readConfig(path: string): Promise<string> {
  const handle = await open(path);

  await using file: Resource = new Resource((): Promise<void> => handle.close());

  return handle.readFile('utf8');
  // `file` is closed automatically when leaving the scope
}
```

Disposal closes the `Resource` without a reason: the closure is marked as **normal**, using a `NormalClosure` signal as the close reason.

### Closing with a reason

`close` accepts any value as _reason_. It propagates to the signal and to the closure function, so everyone involved knows **why** things are stopping.

```ts
const resource: Resource = new Resource((reason: unknown): void => {
  console.log('closing because:', reason);
});

await resource.close('job done');

resource.closeSignal.reason; // 'job done'
```

When no reason is provided, a `NormalClosure` signal is used instead — a `Resource` closure always carries a reason:

```ts
await resource.close();

resource.closeSignal.reason; // NormalClosure — 'Resource closed normally'
```

`close` is idempotent: calling it again returns the same promise.

### Linking lifetimes with `closesWith`

Resources can be chained: a resource closes when its _close sources_ close.

```ts
// close when another `Resource` closes:
const child: Resource = new Resource().closesWith(parent);

// close when an `AbortSignal` aborts:
const task: Resource = new Resource().closesWith(controller.signal);

// several sources at once (`undefined` entries are allowed):
const session: Resource = new Resource().closesWith([parent, controller.signal, maybeSignal]);

// with an undo signal — aborting it un-binds the link:
const temp: Resource = new Resource().closesWith(parent, { signal: undo.signal });
```

The close reason of the source is forwarded to the resource.

### Error handling

If the closure function throws or rejects, the `closed` promise rejects:

```ts
const resource: Resource = new Resource((): Promise<void> => {
  throw new Error('cannot flush');
});

try {
  await resource.close();
} catch (error: unknown) {
  // 'cannot flush' — the same rejection is observable via `resource.closed`
}
```

`throwIfClosed` throws as soon as the resource is closing or closed, with the close reason attached as `cause`:

```ts
resource.throwIfClosed(); // Error('Resource closed', { cause: 'job done' })
```

## ✅ `NormalClosure`

An error signal indicating a **normal** (expected) closure.

It marks a closure as intentional. It's used as the close `reason` of a `Resource`:

- **by default**, when the `Resource` is closed without an explicit reason — including through `await using` (i.e. `Symbol.asyncDispose`),
- **explicitly**, by passing an instance to `close` — with an optional custom message and `cause`.

Cleanup hooks and consumers can then distinguish a clean shutdown from an abnormal one by checking `reason instanceof NormalClosure`.

```ts
import { NormalClosure, Resource } from '@xstd/resource';

// explicit, with a custom message and a cause:
await resource.close(new NormalClosure('pool drained', { cause: signal.reason }));

// detectable in any cleanup hook receiving the close reason:
closeStack.addTeardown((reason: unknown): void => {
  if (reason instanceof NormalClosure) {
    console.log('clean shutdown');
  }
});
```

It extends `Error`, so a `NormalClosure` also carries a stack trace when it flows through promise rejections.

## 🧹 `CloseStack`

A `CloseStack` manages async operations (tasks, teardowns, adopted resources) in the context of a `CloseSource`.

It **never aborts its `closeSource` by itself**: its lifetime is externally managed by its source — it is not usable with `await using`. The source's closure **must** trigger `close`, exactly once — typically from the source's closure hook:

```ts
import { CloseStack, Resource } from '@xstd/resource';

let closeStack: CloseStack;
const resource: Resource = new Resource((reason: unknown): Promise<void> =>
  closeStack.close(reason),
);
closeStack = new CloseStack(resource);

// closing `resource` now runs the whole cleanup sequence:
await resource.close('bye');
```

When `close` is called, the sequence is:

1. **await** all pending tasks (`runTask`),
2. run all `concurrent` teardowns concurrently — including adopted resources — and **await** them,
3. run all `sequential` teardowns, **in reverse order of addition**, and await them.

### Running tasks: `runTask`

Tasks are started immediately and receive a signal aborted when the task completes, when the `CloseStack` closes, or when the optional `signal` aborts. A bare `Promise` may also be passed instead of a function.

```ts
const users: User[] = await closeStack.runTask(async (signal: AbortSignal): Promise<User[]> => {
  return fetchUsers({ signal });
});
```

When the `CloseStack` closes, pending tasks are awaited (fulfilled or rejected) **before** any teardown runs — closing never yanks the rug under in-flight work. Task rejections are **not** re-thrown by `close`: they are reported to the `runTask` caller, who is expected to handle them.

### Adding teardowns: `addTeardown`

Teardowns run when the `CloseStack` closes:

- `sequential` (default): executed in reverse order of addition — like unwinding a stack,
- `concurrent`: executed all at once.

```ts
closeStack.addTeardown((): void => {
  handle.close(); // sequential (default)
});

closeStack.addTeardown((): Promise<void> => logger.flush(), { mode: 'concurrent' });
```

Teardowns receive the close `reason` — check for `NormalClosure` to detect a clean shutdown.

An optional `signal` removes a teardown before it runs (undo the registration). Un-registering stays effective until the teardown's phase begins: once the close sequence has reached it, the teardown runs anyway.

### Adopting resources: `adoptResource`

Adoption ties a child `Resource` to the stack's lifetime:

- the child's closure is **initiated** as soon as the stack's `closeSource` aborts (i.e. when the stack starts closing),
- its **full closure** is awaited during the concurrent teardown phase, before the sequential teardowns,
- if the child closes by itself, the adoption is undone automatically,
- an optional `signal` removes the adoption.

```ts
closeStack.adoptResource(childConnection);
```

### Listening until close: `addEventListener`

Attaches an event listener to any `EventTarget`, automatically removed when the `CloseStack` closes. Throws if the stack is closed.

```ts
closeStack.addEventListener(emitter, 'message', (event: MessageEvent): void => {
  console.log(event.data);
});
```

### Errors during close

If teardowns fail, `close` rejects — sequentially with a `SuppressedError` chain (the last error thrown wins), concurrently with an `AggregateError` (a single error is rethrown as-is). The stack remains closed either way.

## 🐞 Debugging

Debug helpers live in a separate entry point: `@xstd/resource/protected`. They are opt-in: if you never import it, nothing is recorded and the debug code is tree-shaken away.

### Lifecycle logs: `debugResource`

Logs `[OPEN]`, `[CLOSING]` (with the close reason) and `[CLOSED]` (or `[CLOSED (with error)]`) as the resource lives:

```ts
import { debugResource } from '@xstd/resource/protected';

const connection: Resource = debugResource(new Resource(...), 'connection');
```

### Live resource graph

Once enabled, every `closesWith` and `adoptResource` link is **recorded automatically** — no manual bookkeeping:

```ts
import { enableResourceGraph, resourceGraph } from '@xstd/resource/protected';

enableResourceGraph(); // records links created from now on

// ...later, dump a mermaid flowchart of the live links:
console.log(resourceGraph()); // paste the output into mermaid.live
```

- links are dropped automatically as soon as one of their ends closes (or their un-bind `signal` aborts): the graph only shows the **live** resources,
- `debugResource` also names the graph nodes after its `name` argument.

Or open [mermaid.live](https://mermaid.live) directly with the graph pre-loaded (returns the URL, so it also works outside a browser):

```ts
import { openResourceGraph } from '@xstd/resource/protected';

await openResourceGraph();
```

## 📚 API

### `Resource`

| Member                                   | Description                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `new Resource(close?)`                   | Creates a resource. `close` is called once, on closure.                                           |
| `closeSignal: AbortSignal`               | Aborted when the resource is closing or closed.                                                   |
| `closed: Promise<void>`                  | Resolves when fully closed; rejects if the closure function fails.                                |
| `throwIfClosed(): void`                  | Throws (with the close reason as `cause`) if closing or closed.                                   |
| `close(reason?): Promise<void>`          | Initiates closure (idempotent); resolves when fully closed. Defaults to a `NormalClosure` reason. |
| `[Symbol.asyncDispose](): Promise<void>` | For `await using`; calls `close()` — a normal closure.                                            |
| `closesWith(sources, options?): this`    | Closes when `Resource`/`AbortSignal` source(s) close; `options.signal` un-binds.                  |

### `CloseStack`

| Member                                               | Description                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `new CloseStack(closeSource)`                        | Tracks a `Resource` or `AbortSignal` as lifecycle source.                       |
| `static sequentially(factories, ...args)`            | Runs functions one after another; errors chained via `SuppressedError`.         |
| `static concurrently(factories, ...args)`            | Runs functions at once; errors aggregated into an `AggregateError`.             |
| `throwIfClosed(): void`                              | Throws (with the close reason as `cause`) if closing or closed.                 |
| `runTask(task, options?)`                            | Runs a signal-aware task; awaited before teardowns at close.                    |
| `addTeardown(teardown, options?)`                    | Registers cleanup; `mode: 'sequential' \| 'concurrent'`, `signal` un-registers. |
| `adoptResource(resource, options?)`                  | Ties a `Resource`'s lifetime to the stack; `signal` un-adopts.                  |
| `addEventListener(target, type, listener, options?)` | Listens until the stack closes; throws if closed.                               |
| `close(reason): Promise<void>`                       | Runs the cleanup sequence. **Exactly once**, from the source's closure hook.    |

### `NormalClosure`

| Member                                  | Description                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `new NormalClosure(message?, options?)` | Creates the signal; default message: `'Resource closed normally'`. `options.cause` chains the triggering reason. |
| `new NormalClosure(options?)`           | Same, with the default message.                                                                                  |
| `name`                                  | `'NormalClosure'`.                                                                                               |

### Types

```ts
type CloseSource = Resource | AbortSignal;

interface OnCloseResource {
  (reason: unknown): PromiseLike<void> | void;
}

type OptionalOnCloseResource = OnCloseResource | undefined | void;

type ResourceCloseWithInput = CloseSource | readonly (CloseSource | undefined)[];

interface TeardownFunction {
  (reason: unknown): unknown;
}

interface AsyncTask<GReturn> {
  (signal: AbortSignal): PromiseLike<GReturn> | GReturn;
}

interface CloseStackPromiseFactory<GArguments extends unknown[]> {
  (...args: GArguments): unknown;
}
```

## 🏭 `ResourceFactory`

> [!WARNING]
> Experimental.

Creates `Resource` instances from arguments:

```ts
import { ResourceFactory } from '@xstd/resource';

const connectionFactory = new ResourceFactory(async (url: string): Promise<Resource> => {
  const client = await connect(url);

  return new Resource((): Promise<void> => client.end());
});

const connection: Resource = await connectionFactory.open('postgres://localhost');
```
