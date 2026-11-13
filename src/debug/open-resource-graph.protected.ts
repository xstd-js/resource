import { resourceGraph } from './resource-graph.protected.ts';

const MERMAID_LIVE_EDIT_URL: string = 'https://mermaid.live/edit';

async function deflateToBytes(json: string): Promise<Uint8Array> {
  const stream: ReadableStream<Uint8Array> = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));

  const buffer: ArrayBuffer = await new Response(stream).arrayBuffer();

  return new Uint8Array(buffer);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary: string = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Builds the mermaid graph (see `resourceGraph`), encodes it into a
 * [mermaid.live](https://mermaid.live) URL, and opens it:
 * in a browser, a new tab is opened with the graph; elsewhere, the URL is
 * simply returned (e.g. to be logged in a terminal).
 *
 * The graph state is compressed with the native `CompressionStream` ('deflate',
 * the same format as the mermaid.live `pako:` URLs): no dependency is required.
 */
export async function openResourceGraph(): Promise<string> {
  const json: string = JSON.stringify({ code: resourceGraph(), mermaid: { theme: 'default' } });

  const payload: string = toBase64Url(await deflateToBytes(json));

  const url: string = `${MERMAID_LIVE_EDIT_URL}#pako:${payload}`;

  if (typeof window !== 'undefined') {
    window.open(url);
  }

  return url;
}
