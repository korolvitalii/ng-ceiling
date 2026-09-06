import semver from 'semver';
import type {
  DeclaredToolchain,
  NodeVersionSource,
  RegistryPackage,
  RegistryPackageVersion,
  ToolchainAxis,
} from './types';

const ANGULAR_CORE = '@angular/core';
const ANGULAR_COMPILER_CLI = '@angular/compiler-cli';
const ANGULAR_CLI = '@angular/cli';

export interface ToolchainFailure {
  axis: ToolchainAxis;
  installed: string;
  requiredRange: string;
}

/**
 * The published version of an Angular-family package that represents a given
 * major — the highest stable release with that major, or the highest
 * prerelease if the major hasn't stabilised yet. Same "prefer stable"
 * pattern findCompatibleVersion uses in compat.ts.
 */
function versionForMajor(
  pkg: RegistryPackage | undefined,
  major: number,
): RegistryPackageVersion | undefined {
  if (pkg === undefined) return undefined;

  const candidates = pkg.versions.filter(
    (entry) => semver.valid(entry.version) !== null && semver.major(entry.version) === major,
  );
  const stable = candidates.filter((entry) => semver.prerelease(entry.version) === null);
  const pool = stable.length > 0 ? stable : candidates;

  return pool.sort((a, b) => semver.compare(a.version, b.version)).at(-1);
}

/** The peer range for `name` on this version, or undefined if unmeasurable. */
function peerRange(version: RegistryPackageVersion | undefined, name: string): string | undefined {
  if (version === undefined) return undefined;
  if (version.peerDependenciesMeta?.[name]?.optional === true) return undefined;

  const range = version.peerDependencies?.[name];
  return range !== undefined && semver.validRange(range) !== null ? range : undefined;
}

/**
 * Does a declared range fail to overlap what's required? Both sides missing
 * or unparseable means unmeasurable, never a blocker — the same rule
 * angularPeerRange applies in compat.ts.
 */
function declaredRangeFails(declared: string | undefined, required: string | undefined): boolean {
  if (declared === undefined || required === undefined) return false;
  if (semver.validRange(declared) === null) return false;
  return !semver.intersects(declared, required);
}

/**
 * Node is the one axis compared as a pinned value, not a range, when it comes
 * from .nvmrc, .node-version or the process.version fallback — those are all
 * a single concrete version. Only package.json's engines.node is a real range.
 */
function nodeFails(node: NodeVersionSource | undefined, required: string | undefined): boolean {
  if (node === undefined || required === undefined) return false;
  if (semver.validRange(required) === null) return false;

  if (node.kind === 'range') {
    return semver.validRange(node.value) === null ? false : !semver.intersects(node.value, required);
  }

  const pinned = semver.coerce(node.value);
  return pinned === null ? false : !semver.satisfies(pinned, required);
}

/**
 * Every toolchain axis that fails to meet Angular's requirement at `major`.
 * `ignore` excludes one axis — used by unlock analysis to ask "what would the
 * ceiling be if this specific axis were upgraded".
 */
export function toolchainFailuresAt(
  toolchain: DeclaredToolchain,
  packages: Record<string, RegistryPackage>,
  major: number,
  ignore?: ToolchainAxis,
): ToolchainFailure[] {
  const core = versionForMajor(packages[ANGULAR_CORE], major);
  const compilerCli = versionForMajor(packages[ANGULAR_COMPILER_CLI], major);
  const cli = versionForMajor(packages[ANGULAR_CLI], major);

  const failures: ToolchainFailure[] = [];

  if (ignore !== 'rxjs') {
    const required = peerRange(core, 'rxjs');
    if (declaredRangeFails(toolchain.rxjs, required)) {
      failures.push({ axis: 'rxjs', installed: toolchain.rxjs!, requiredRange: required! });
    }
  }

  if (ignore !== 'zone.js') {
    const required = peerRange(core, 'zone.js');
    if (declaredRangeFails(toolchain.zoneJs, required)) {
      failures.push({ axis: 'zone.js', installed: toolchain.zoneJs!, requiredRange: required! });
    }
  }

  if (ignore !== 'typescript') {
    const required = peerRange(compilerCli, 'typescript');
    if (declaredRangeFails(toolchain.typescript, required)) {
      failures.push({ axis: 'typescript', installed: toolchain.typescript!, requiredRange: required! });
    }
  }

  if (ignore !== 'node') {
    const required = cli?.engines?.node;
    if (nodeFails(toolchain.node, required)) {
      failures.push({ axis: 'node', installed: toolchain.node!.value, requiredRange: required! });
    }
  }

  return failures;
}

export interface ToolchainCeilingResult {
  ceiling: number;
  firstBlocked?: number;
  failures: ToolchainFailure[];
}

/**
 * Walk upwards from the current major and stop at the first one where some
 * toolchain axis fails to meet Angular's requirement. Same walk shape as
 * compat.ts's solveCeiling, kept as an independent pure function — compat.ts
 * combines the two by taking the minimum blocked major.
 */
export function solveToolchainCeiling(
  toolchain: DeclaredToolchain,
  packages: Record<string, RegistryPackage>,
  current: number,
  latest: number,
  ignore?: ToolchainAxis,
): ToolchainCeilingResult {
  for (let major = current + 1; major <= latest; major++) {
    const failures = toolchainFailuresAt(toolchain, packages, major, ignore);
    if (failures.length > 0) return { ceiling: major - 1, firstBlocked: major, failures };
  }
  return { ceiling: Math.max(current, latest), failures: [] };
}
