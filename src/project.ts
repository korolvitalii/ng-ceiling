import type { ProjectDependency } from './types';

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Direct dependencies only — transitive ones are not analysed in V1, which is
 * the main reason the reported ceiling is an upper bound.
 *
 * devDependencies are included: @angular-devkit/build-angular and friends
 * declare Angular peers and block upgrades exactly like runtime packages do.
 */
export function toDependencies(pkg: PackageJson): ProjectDependency[] {
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(declared).map(([name, requestedVersion]) => ({ name, requestedVersion }));
}
