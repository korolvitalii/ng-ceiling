import type { RegistryPackage, RegistryPackageVersion } from './types';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/**
 * The abbreviated packument carries peerDependencies, engines and dist-tags,
 * and is dramatically smaller than the full document. Fetching full packuments
 * for packages like primeng or ag-grid is slow enough to be noticeable.
 */
const ABBREVIATED = 'application/vnd.npm.install-v1+json';

const CONCURRENCY = 8;

export class RegistryUnavailableError extends Error {
  constructor(packageName: string, cause: unknown) {
    super(`could not reach the npm registry while fetching ${packageName}`);
    this.name = 'RegistryUnavailableError';
    this.cause = cause;
  }
}

interface AbbreviatedPackument {
  name?: string;
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, Omit<RegistryPackageVersion, 'version'>>;
}

function registryUrl(): string {
  return (process.env['npm_config_registry'] ?? DEFAULT_REGISTRY).replace(/\/+$/, '');
}

/** Fetches one abbreviated packument. A package that does not exist is not an error. */
async function fetchPackage(name: string): Promise<RegistryPackage | undefined> {
  const url = `${registryUrl()}/${name.replace('/', '%2F')}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: ABBREVIATED } });
  } catch (cause) {
    throw new RegistryUnavailableError(name, cause);
  }

  if (response.status === 404) return undefined;
  if (!response.ok) throw new RegistryUnavailableError(name, new Error(`HTTP ${response.status}`));

  const body = (await response.json()) as AbbreviatedPackument;
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
 * Fetches every package once, at a bounded concurrency. The Map is per run —
 * a disk cache is only worth adding if repeated runs actually feel slow.
 */
export async function fetchPackages(names: string[]): Promise<Record<string, RegistryPackage>> {
  const queue = [...new Set(names)];
  const found = new Map<string, RegistryPackage>();

  const worker = async (): Promise<void> => {
    for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
      const pkg = await fetchPackage(name);
      if (pkg !== undefined) found.set(name, pkg);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return Object.fromEntries(found);
}
