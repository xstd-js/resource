import { untilEvent } from '@xstd/abortable';
import { type Resource } from '../resource/resource.ts';
import { debugHooks, type ResourceLink } from './debug-hooks.private.ts';

const NAMES: Map<Resource, string> = new Map();
const EDGES: Set<ResourceLink> = new Set();
const EDGE_KEYS: Map<string, ResourceLink> = new Map();
const RESOURCE_IDS: WeakMap<Resource, number> = new WeakMap();

let nextResourceId: number = 1;

function resourceId(resource: Resource): string {
  let id: number | undefined = RESOURCE_IDS.get(resource);

  if (id === undefined) {
    id = nextResourceId++;
    RESOURCE_IDS.set(resource, id);
  }

  return `resource_${id}`;
}

function recordResourceLink(link: ResourceLink): void {
  const key: string = `${resourceId(link.from)}|${resourceId(link.to)}|${link.type}`;

  if (EDGE_KEYS.has(key)) {
    return;
  }

  EDGES.add(link);
  EDGE_KEYS.set(key, link);

  // the link is dropped as soon as it becomes irrelevant:
  // one of its ends closed, or the un-bind signal aborted
  Promise.any([
    link.from.closed,
    link.to.closed,
    ...(link.signal === undefined ? [] : [untilEvent(link.signal, 'abort')]),
  ]).then((): void => {
    EDGES.delete(link);
    EDGE_KEYS.delete(key);
  });
}

/**
 * Starts recording the links between `Resource`s: every `closesWith` and
 * `adoptResource` call is recorded automatically from now on.
 *
 * Links created before this call are not tracked retroactively.
 */
export function enableResourceGraph(): void {
  debugHooks.onResourceLink = recordResourceLink;
}

/**
 * Stops recording the links between `Resource`s and clears the recorded state.
 */
export function disableResourceGraph(): void {
  debugHooks.onResourceLink = undefined;
  NAMES.clear();
  EDGES.clear();
  EDGE_KEYS.clear();
}

/**
 * Overrides the label of a `Resource`'s node in the generated graph.
 *
 * `debugResource` calls it with its `name` argument.
 */
export function nameResource(resource: Resource, name: string): void {
  NAMES.set(resource, name);
}

/**
 * Returns a [mermaid flowchart](https://mermaid.js.org/syntax/flowchart.html)
 * representing the live links between the recorded `Resource`s.
 *
 * Closed `Resource`s have no live links anymore: they don't appear in the graph.
 * Paste the output into [mermaid.live](https://mermaid.live) or a mermaid preview
 * to visualize it.
 */
export function resourceGraph(): string {
  const nodeIds: Map<Resource, string> = new Map();
  const nodeLines: string[] = [];
  const edgeLines: string[] = [];

  for (const link of EDGES) {
    for (const resource of [link.from, link.to]) {
      if (!nodeIds.has(resource)) {
        const id: string = `resource_${nodeIds.size}`;
        nodeIds.set(resource, id);
        nodeLines.push(`  ${id}[${NAMES.get(resource) ?? resource.constructor.name}]`);
      }
    }

    edgeLines.push(`  ${nodeIds.get(link.from)} -- ${link.type} --> ${nodeIds.get(link.to)}`);
  }

  return ['flowchart LR', ...nodeLines, ...edgeLines].join('\n');
}
