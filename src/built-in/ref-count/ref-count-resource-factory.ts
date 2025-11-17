import { type Abortable, abortify } from '@xstd/abortable';
import { ResourceFactory } from '../../factory/resource-factory.js';
import { type OpenResource } from '../../factory/types/open-resource.js';
import { type Resource } from '../../resource/resource.js';

export interface RefCountResourceFactoryOptions<
  GSharedResource extends Resource,
  GRefContResource extends Resource,
> extends RefCountResourceFactoryOptionsForConsumer {
  readonly open: OpenResource<[], GSharedResource> | ResourceFactory<[], GSharedResource>;
  readonly create: CreateRefCountResource<GSharedResource, GRefContResource>;
}

export interface RefCountResourceFactoryOptionsForConsumer {
  readonly maintainAlive?: number;
}

export interface CloseRefCountResource {
  (reason: unknown): Promise<void>;
}

export interface CreateRefCountResource<
  GSharedResource extends Resource,
  GRefContResource extends Resource,
> {
  (sharedResource: GSharedResource, close: CloseRefCountResource): GRefContResource;
}

export class RefCountResourceFactory<
  GSharedResource extends Resource,
  GRefContResource extends Resource,
> extends ResourceFactory<[], GRefContResource> {
  constructor({
    open,
    create,
    maintainAlive = 0,
  }: RefCountResourceFactoryOptions<GSharedResource, GRefContResource>) {
    if (typeof open === 'function') {
      open = new ResourceFactory<[], GSharedResource>(open);
    }

    let consumers: number = 0;
    let openController: AbortController | undefined;
    let openPromise: Promise<void> | undefined;
    let originalResource: GSharedResource | undefined;
    let closePromise: Promise<void> | undefined;
    let maintainAliveTimer: any | undefined;

    const closeDefinitively = async (reason: unknown): Promise<void> => {
      openController!.abort(reason);
      openController = undefined;

      const { promise, resolve } = Promise.withResolvers<void>();
      closePromise = promise;

      try {
        await originalResource!.close();
      } finally {
        originalResource = undefined;
        closePromise = undefined;
        resolve();
      }
    };

    const close: CloseRefCountResource = async (reason: unknown): Promise<void> => {
      consumers--;

      if (consumers === 0) {
        if (maintainAlive <= 0) {
          await closeDefinitively(reason);
        } else {
          maintainAliveTimer = setTimeout((): void => {
            maintainAliveTimer = undefined;
            closeDefinitively(reason).catch(reportError);
          }, maintainAlive);
        }
      }
    };

    super(async ({ signal }: Abortable = {}): Promise<GRefContResource> => {
      signal?.throwIfAborted();

      if (maintainAliveTimer !== undefined) {
        clearTimeout(maintainAliveTimer);
        maintainAliveTimer = undefined;
      }

      if (closePromise !== undefined) {
        await abortify(closePromise, { signal });
      }

      consumers++;

      try {
        if (consumers === 1) {
          openController = new AbortController();
          const signal: AbortSignal = openController.signal;
          openPromise = open.open({ signal }).then((resource: GSharedResource): void => {
            signal.throwIfAborted();
            originalResource = resource;
          });
        }

        await abortify(openPromise!, {
          signal,
        });

        return create(originalResource!, close);
      } catch (error: unknown) {
        try {
          await close(error);
        } catch (_error: unknown) {
          throw new SuppressedError(error, _error);
        }

        throw error;
      }
    });
  }
}
