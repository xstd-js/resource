import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Resource } from '../resource/resource.ts';
import { openResourceGraph } from './open-resource-graph.protected.ts';
import {
  disableResourceGraph,
  enableResourceGraph,
  resourceGraph,
} from './resource-graph.protected.ts';

afterEach((): void => {
  disableResourceGraph();

  delete (globalThis as { window?: unknown }).window;
});

describe('openResourceGraph', () => {
  it('should return a mermaid.live url holding the graph state', async () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    child.closesWith(parent);

    const url: string = await openResourceGraph();

    expect(url).toMatch(/^https:\/\/mermaid\.live\/edit#pako:[A-Za-z0-9_-]+$/);

    const payload: string = url.split('#pako:')[1] as string;
    const json: string = inflateSync(
      Buffer.from(payload.replaceAll('-', '+').replaceAll('_', '/'), 'base64'),
    ).toString('utf8');

    expect(JSON.parse(json)).toEqual({
      code: resourceGraph(),
      mermaid: { theme: 'default' },
    });
  });

  it('should open the url when running in a browser context', async () => {
    const openSpy: ReturnType<typeof vi.fn> = vi.fn();
    (globalThis as { window?: unknown }).window = { open: openSpy };

    enableResourceGraph();

    const url: string = await openResourceGraph();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(url);
  });
});
