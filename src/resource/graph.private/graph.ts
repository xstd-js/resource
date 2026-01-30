/* istanbul ignore file -- @preserve */

import { type Abortable, untilEvent } from '@xstd/abortable';
import { type Resource } from '../resource.ts';

const RESOURCES = new Set<Resource>();

export function registerResource(resource: Resource): void {
  if (RESOURCES.has(resource)) {
    throw new Error('Resource already registered');
  }

  RESOURCES.add(resource);

  resource.closed.then((): void => {
    RESOURCES.delete(resource);
  });

  // resource.closeSignal.addEventListener('abort', (): void => {
  //   RESOURCES.delete(resource);
  // }, { once: true });
}

/*---*/

interface ResourceRelation {
  readonly from: Resource;
  readonly relation: string;
  readonly to: Resource;
}

const RESOURCE_RELATIONS = new Set<ResourceRelation>();

export function registerResourceRelation(
  from: Resource,
  relation: string,
  to: Resource,
  { signal }: Abortable = {},
): void {
  if (signal?.aborted) {
    return;
  }

  if (!RESOURCES.has(from)) {
    throw new Error('"from" resource not registered');
  }

  if (!RESOURCES.has(to)) {
    throw new Error('"to" resource not registered');
  }

  const resourceRelation: ResourceRelation = {
    from,
    relation,
    to,
  };

  RESOURCE_RELATIONS.add(resourceRelation);

  Promise.any([
    from.closed,
    to.closed,
    ...(signal === undefined ? [] : [untilEvent(signal, 'abort')]),
  ]).then((): void => {
    RESOURCE_RELATIONS.delete(resourceRelation);
  });
}

/*---*/

// [flowchart](https://mermaid.js.org/syntax/flowchart.html)

function indent(lines: readonly string[], indent: string = '  '): readonly string[] {
  return lines.map((line: string): string => indent + line);
}

export function generateResourceGraph(): string {
  const resourceToId = new Map<Resource, string>();

  const lines: readonly string[] = [
    'flowchart LR',
    ...indent([
      ...Array.from(RESOURCES).flatMap((resource: Resource, index: number): readonly string[] => {
        const id: string = `resource_${index}`;
        resourceToId.set(resource, id);
        return [`${id}[${resource.constructor.name}]`];
      }),
      '',
      ...Array.from(RESOURCE_RELATIONS).flatMap(
        ({ from, relation, to }: ResourceRelation): readonly string[] => {
          return [`${resourceToId.get(from)}-- ${relation} -->${resourceToId.get(to)}`];
        },
      ),
    ]),
  ];

  return lines.join('\n');
}

export async function openResourceGraph(): Promise<void> {
  const { deflate } = (await import(
    // @ts-ignore
    'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.esm.min.mjs'
  )) as any;

  const mermaidCode: string = generateResourceGraph();

  const json: string = JSON.stringify({ code: mermaidCode, mermaid: { theme: 'default' } });

  const compressed: number[] = deflate(json, { to: 'string' });

  const base64: string = btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  window.open(`https://mermaid.live/edit#pako:${base64}`);
}
