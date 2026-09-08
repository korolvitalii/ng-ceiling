import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { NgCeilingError } from './errors';
import type { DeclaredToolchain, NodeVersionSource, ProjectDependency } from './types';

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
}

/**
 * typescript, rxjs and zone.js are read by readDeclaredToolchain instead —
 * they're Angular's own peers, not third-party @angular-aware packages, and
 * would otherwise double up (once here, once as a toolchain axis).
 */
const TOOLCHAIN_PACKAGE_NAMES = new Set(['typescript', 'rxjs', 'zone.js']);

/**
 * Direct dependencies only — transitive ones are not analysed in V1, which is
 * the main reason the reported ceiling is an upper bound.
 *
 * devDependencies are included: @angular-devkit/build-angular and friends
 * declare Angular peers and block upgrades exactly like runtime packages do.
 */
export function toDependencies(pkg: PackageJson): ProjectDependency[] {
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(declared)
    .filter(([name]) => !TOOLCHAIN_PACKAGE_NAMES.has(name))
    .map(([name, requestedVersion]) => ({ name, requestedVersion }));
}

/** Reads the project's package.json. The only place this package touches disk. */
export function readPackageJson(cwd: string): PackageJson {
  const file = join(cwd, 'package.json');

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new NgCeilingError(`no package.json found in ${cwd}`, {
      hint: 'run ng-ceiling from an Angular project directory, or pass --cwd <path>',
    });
  }

  try {
    return JSON.parse(raw) as PackageJson;
  } catch (cause) {
    throw new NgCeilingError(`${file} is not valid JSON`, { cause });
  }
}

/**
 * A bare version like "20", "v20.11.0" or "20.11" read as a pinned value.
 * A file that exists but holds an nvm alias ("lts/iron", "node") rather than
 * a version is treated the same as a missing file — never guessed, and left
 * for the next source in the precedence order to answer instead.
 */
function readVersionFile(cwd: string, filename: string): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, filename), 'utf8');
  } catch {
    return undefined;
  }
  const value = raw.trim().replace(/^v/, '');
  return semver.coerce(value) !== null ? value : undefined;
}

/**
 * Node version, in precedence order: .nvmrc, .node-version, package.json
 * engines.node, then process.version as a last resort — flagged as such,
 * since it describes the machine the tool ran on, not the project.
 *
 * A file that exists but doesn't parse as semver (nvm aliases like
 * "lts/iron", "node") falls through to the next source rather than failing:
 * never guess, treat it as unmeasured for that source.
 */
function readNodeVersion(cwd: string, pkg: PackageJson): NodeVersionSource | undefined {
  const nvmrc = readVersionFile(cwd, '.nvmrc');
  if (nvmrc !== undefined) return { value: nvmrc, kind: 'version', source: 'nvmrc' };

  const nodeVersion = readVersionFile(cwd, '.node-version');
  if (nodeVersion !== undefined) return { value: nodeVersion, kind: 'version', source: 'node-version' };

  const engines = pkg.engines?.node;
  if (engines !== undefined) return { value: engines, kind: 'range', source: 'engines' };

  return { value: process.version.replace(/^v/, ''), kind: 'version', source: 'process' };
}

/**
 * What the project declares for each axis Angular's own peers constrain.
 * typescript/rxjs/zone.js come from the same dependencies readPackageJson
 * already parsed; Node needs its own file reads. The Node fallback to
 * process.version always succeeds, so this never returns an empty node field
 * — but typescript/rxjs/zoneJs are genuinely absent when undeclared (e.g. a
 * zoneless Angular project has no zone.js dependency at all), and stay
 * undefined rather than guessed.
 */
export function readDeclaredToolchain(cwd: string, pkg: PackageJson): DeclaredToolchain {
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  return {
    typescript: declared['typescript'],
    rxjs: declared['rxjs'],
    zoneJs: declared['zone.js'],
    node: readNodeVersion(cwd, pkg),
  };
}
