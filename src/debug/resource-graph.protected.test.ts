import { sleep } from '@xstd/abortable';
import { afterEach, describe, expect, it } from 'vitest';
import { CloseStack } from '../close-stack/close-stack.ts';
import { Resource } from '../resource/resource.ts';
import {
  disableResourceGraph,
  enableResourceGraph,
  nameResource,
  resourceGraph,
} from './resource-graph.protected.ts';

afterEach((): void => {
  disableResourceGraph();
});

describe('resourceGraph', () => {
  it('should not record links created while disabled', () => {
    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    child.closesWith(parent);

    expect(resourceGraph()).toBe('flowchart LR');
  });

  it('should record "closes-with" links created while enabled', () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    child.closesWith(parent);

    expect(resourceGraph()).toBe(
      [
        'flowchart LR',
        '  resource_0[Resource]',
        '  resource_1[Resource]',
        '  resource_0 -- closes-with --> resource_1',
      ].join('\n'),
    );
  });

  it('should use the resource name as node label when provided', () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    nameResource(parent, 'parent');
    child.closesWith(parent);

    expect(resourceGraph()).toBe(
      [
        'flowchart LR',
        '  resource_0[Resource]',
        '  resource_1[parent]',
        '  resource_0 -- closes-with --> resource_1',
      ].join('\n'),
    );
  });

  it('should record a link only once', () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    child.closesWith([parent, parent, undefined]);

    expect(resourceGraph().split('\n')).toHaveLength(4);
  });

  it('should declare a node only once when it appears in several links', () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const firstChild: Resource = new Resource();
    const secondChild: Resource = new Resource();

    firstChild.closesWith(parent);
    secondChild.closesWith(parent);

    expect(resourceGraph()).toBe(
      [
        'flowchart LR',
        '  resource_0[Resource]',
        '  resource_1[Resource]',
        '  resource_2[Resource]',
        '  resource_0 -- closes-with --> resource_1',
        '  resource_2 -- closes-with --> resource_1',
      ].join('\n'),
    );
  });

  it('should ignore AbortSignal sources', () => {
    enableResourceGraph();

    const resource: Resource = new Resource();
    const controller: AbortController = new AbortController();

    resource.closesWith(controller.signal);

    expect(resourceGraph()).toBe('flowchart LR');
  });

  it('should drop a link when the closing resource closes', async () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    child.closesWith(parent);

    await child.close('test');
    await sleep(1);

    expect(resourceGraph()).toBe('flowchart LR');
  });

  it('should drop a link when the closed-by resource closes', async () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    child.closesWith(parent);

    await parent.close('test');
    await sleep(1);

    expect(resourceGraph()).toBe('flowchart LR');
  });

  it('should drop a link when the un-bind signal aborts', async () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();
    const controller: AbortController = new AbortController();

    child.closesWith(parent, { signal: controller.signal });

    controller.abort('test');
    await sleep(1);

    expect(resourceGraph()).toBe('flowchart LR');
  });

  it('should record "adopted-by" links when the CloseStack source is a Resource', () => {
    enableResourceGraph();

    let closeStack: CloseStack;
    const source: Resource = new Resource((reason: unknown): Promise<void> =>
      closeStack.close(reason),
    );
    closeStack = new CloseStack(source);

    const child: Resource = new Resource();
    closeStack.adoptResource(child);

    expect(resourceGraph()).toBe(
      [
        'flowchart LR',
        '  resource_0[Resource]',
        '  resource_1[Resource]',
        '  resource_0 -- adopted-by --> resource_1',
      ].join('\n'),
    );
  });

  it('should ignore adoption when the CloseStack source is an AbortSignal', () => {
    enableResourceGraph();

    const closeStack: CloseStack = new CloseStack(new AbortController().signal);

    closeStack.adoptResource(new Resource());

    expect(resourceGraph()).toBe('flowchart LR');
  });

  it('should clear the recorded state and stop recording when disabled', () => {
    enableResourceGraph();

    const parent: Resource = new Resource();
    const child: Resource = new Resource();

    nameResource(parent, 'parent');
    child.closesWith(parent);

    disableResourceGraph();

    expect(resourceGraph()).toBe('flowchart LR');

    child.closesWith(parent);

    expect(resourceGraph()).toBe('flowchart LR');
  });
});
