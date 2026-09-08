import { RegistryUnavailableError } from './errors';
import type { RegistryPackage, RegistryPackageVersion } from './types';

export { RegistryUnavailableError } from './errors';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/**
 * The abbreviated packument carries peerDependencies, engines and dist-tags,
 * and is dramatically smaller than the full document. Fetching full packuments
 * for packages like primeng or ag-grid is slow enough to be noticeable.
 */
const ABBREVIATED = 'application/vnd.npm.install-v1+json';

const CONCURRENCY = 8;

/** Per-request ceiling. A hung connection must not hang the whole CLI. */
const REQUEST_TIMEOUT_MS = 15_000;

interface AbbreviatedPackument {
  name?: string;
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, Omit<RegistryPackageVersion, 'version'>>;
}

/** What one run learned from the registry: the packuments found, and the names that 404'd. */
export interface RegistryResult {
  packages: Record<string, RegistryPackage>;
  /** Names the registry has no record of. Treated as unverified, never as blockers. */
  notFound: string[];
}

function registryUrl(): string {
  return (process.env['npm_config_registry'] ?? DEFAULT_REGISTRY).replace(/\/+$/, '');
}

/**
 * A transport failure, mapped to a message. `AbortSignal.timeout` also aborts
 * the response body stream, so this fires from `response.json()` too when the
 * connection stalls after the headers arrive — not only from `fetch()` itself.
 * A `TimeoutError` or `AbortError` DOMException is our own deadline; anything
 * else that is not a JSON parse error is a dropped or refused connection.
 */
function transportError(name: string, cause: unknown): RegistryUnavailableError {
  if (cause instanceof DOMException && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
    return new RegistryUnavailableError(
      `the npm registry did not respond within ${REQUEST_TIMEOUT_MS / 1000}s while fetching ${name}`,
      cause,
    );
  }
  return new RegistryUnavailableError(
    `could not reach the npm registry while fetching ${name}`,
    cause,
  );
}

/** Fetches one abbreviated packument. A package that does not exist is not an error. */
async function fetchPackage(name: string): Promise<RegistryPackage | undefined> {
  const url = `${registryUrl()}/${name.replace('/', '%2F')}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: ABBREVIATED },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw transportError(name, cause);
  }

  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new RegistryUnavailableError(
      `the npm registry returned HTTP ${response.status} while fetching ${name}`,
    );
  }

  let body: AbbreviatedPackument;
  try {
    body = (await response.json()) as AbbreviatedPackument;
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new RegistryUnavailableError(
        `the npm registry returned a malformed response for ${name}`,
        cause,
      );
    }
    throw transportError(name, cause);
  }

  return {
    name: body.name ?? name,
    distTags: body['dist-tags'] ?? {},
    versions: Object.entries(body.versions ?? {}).map(([version, entry]) => ({
      version,
      ...entry,
    })),
  };
}

/**
 * Fetches every package once, at a bounded concurrency. The result is per run —
 * a disk cache is only worth adding if repeated runs actually feel slow.
 */
export async function fetchPackages(names: string[]): Promise<RegistryResult> {
  const queue = [...new Set(names)];
  const found = new Map<string, RegistryPackage>();
  const notFound: string[] = [];

  const worker = async (): Promise<void> => {
    for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
      const pkg = await fetchPackage(name);
      if (pkg === undefined) notFound.push(name);
      else found.set(name, pkg);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return { packages: Object.fromEntries(found), notFound: notFound.sort() };
}
