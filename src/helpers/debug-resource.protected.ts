/* istanbul ignore file -- @preserve */

import { type Resource } from '../resource/resource.ts';

export function preferDarkColorScheme(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function generateRandomColor(
  light: string = preferDarkColorScheme() ? '75%' : '25%',
): string {
  return `hsl(${Math.floor(Math.random() * 360)}deg, 100%, ${light})`;
}

const COLOR_SCHEME = preferDarkColorScheme()
  ? {
      open: '#35e062',
      closing: '#f6a62e',
      closed: '#ff5a5a',
    }
  : {
      open: '#2dba52',
      closing: '#fda31b',
      closed: '#ff2222',
    };

export function debugResource<GResource extends Resource>(
  resource: GResource,
  name: string,
  color: string = generateRandomColor(),
): GResource {
  console.log(`%c[OPEN]%c ${name}`, `color: ${COLOR_SCHEME.open}`, `color: ${color}`);

  resource.closeSignal.addEventListener(
    'abort',
    (): void => {
      console.log(
        `%c[CLOSING]%c ${name}`,
        `color: ${COLOR_SCHEME.closing}`,
        `color: ${color}`,
        resource.closeSignal.reason,
      );
    },
    {
      once: true,
    },
  );

  resource.closed.then(
    (): void => {
      console.log(`%c[CLOSED]%c ${name}`, `color: ${COLOR_SCHEME.closed}`, `color: ${color}`);
    },
    (error: unknown): void => {
      console.log(
        `%c[CLOSED (with error)]%c ${name}`,
        `color: ${COLOR_SCHEME.closed}`,
        `color: ${color}`,
        error,
      );
    },
  );

  return resource;
}
