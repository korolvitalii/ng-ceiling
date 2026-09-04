import semver from 'semver';
import type {
  CeilingAnalysis,
  DependencyBlocker,
  KnownDependency,
  ProjectDependency,
  RegistryPackage,
  RegistryPackageVersion,
  SupportedVersion,
} from './types';

const ANGULAR_SCOPE = '@angular/';
const ANGULAR_CORE = '@angular/core';

/**
 * The Angular peer range a single published version declares, or undefined if
 * it declares none that can be measured.
 *
 * An optional peer is never a blocker, and a malformed range is unmeasured
 * rather than incompatible — both yield undefined, which pushes the dependency
 * towards UNKNOWN instead of lowering the ceiling.
 */
export function angularPeerRange(version: RegistryPackageVersion): string | undefined {
  const peers = version.peerDependencies ?? {};
  const meta = version.peerDependenciesMeta ?? {};

  const names = Object.keys(peers).filter((name) => name.startsWith(ANGULAR_SCOPE));
  const ordered = names.includes(ANGULAR_CORE)
    ? [ANGULAR_CORE, ...names.filter((name) => name !== ANGULAR_CORE)]
    : names;

  for (const name of ordered) {
    if (meta[name]?.optional === true) continue;
    const range = peers[name];
    if (range !== undefined && semver.validRange(range) !== null) return range;
  }
  return undefined;
}

/** Every published version that declares an Angular peer, ascending. */
export function toSupportedVersions(pkg: RegistryPackage): SupportedVersion[] {
  return pkg.versions
    .filter((entry) => semver.valid(entry.version) !== null)
    .flatMap((entry) => {
      const angularRange = angularPeerRange(entry);
      return angularRange === undefined ? [] : [{ version: entry.version, angularRange }];
    })
    .sort((a, b) => semver.compare(a.version, b.version));
}

/**
 * Does a peer range overlap an Angular major at all?
 *
 * Deliberately `intersects` and not `satisfies`: a package peering `^17.3.0`
 * does support Angular 17, but `satisfies('17.0.0', '^17.3.0')` is false.
 */
export function rangeCoversMajor(range: string, major: number): boolean {
  return semver.intersects(range, `>=${major}.0.0 <${major + 1}.0.0`);
}

/** The lowest published version compatible with an Angular major, if any. */
export function findCompatibleVersion(dep: KnownDependency, major: number): string | undefined {
  const stable = dep.supported.filter((entry) => semver.prerelease(entry.version) === null);
  const candidates = stable.length > 0 ? stable : dep.supported;
  return candidates.find((entry) => rangeCoversMajor(entry.angularRange, major))?.version;
}

/** The highest Angular major any published version of this package supports. */
export function declaredSupport(dep: KnownDependency, upTo: number): string {
  let highest = 0;
  for (let major = 1; major <= upTo; major++) {
    if (findCompatibleVersion(dep, major) !== undefined) highest = major;
  }
  return highest === 0 ? 'Angular (none declared)' : `Angular <=${highest}`;
}

export interface CeilingResult {
  ceiling: number;
  firstBlocked?: number;
  blocked: KnownDependency[];
}

/**
 * Walk upwards from the current major and stop at the first one where some
 * known dependency has no compatible published version.
 */
export function solveCeiling(
  deps: KnownDependency[],
  current: number,
  latest: number,
): CeilingResult {
  for (let major = current + 1; major <= latest; major++) {
    const blocked = deps.filter((dep) => findCompatibleVersion(dep, major) === undefined);
    if (blocked.length > 0) return { ceiling: major - 1, firstBlocked: major, blocked };
  }
  return { ceiling: Math.max(current, latest), blocked: [] };
}

export function currentAngularMajor(dependencies: ProjectDependency[]): number {
  const core = dependencies.find((dep) => dep.name === ANGULAR_CORE);
  if (core === undefined) throw new Error('not an Angular project: no @angular/core dependency');

  const lowest = lowestVersion(core.requestedVersion);
  if (lowest === undefined) {
    throw new Error(`cannot read an Angular version from "${core.requestedVersion}"`);
  }
  return semver.major(lowest);
}

/** Never hardcoded — always read from the @angular/core dist-tags. */
export function latestAngularMajor(packages: Record<string, RegistryPackage>): number {
  const latest = packages[ANGULAR_CORE]?.distTags['latest'];
  const parsed = latest === undefined ? null : semver.parse(latest);
  if (parsed === null) {
    throw new Error('cannot read the latest Angular major from @angular/core dist-tags');
  }
  return parsed.major;
}

function lowestVersion(range: string): string | undefined {
  try {
    return semver.minVersion(range)?.version;
  } catch {
    return undefined;
  }
}

/**
 * The whole calculation, as one pure function over already-fetched data.
 *
 * Slice 1 measures third-party Angular peers only. Angular's own constraints on
 * TypeScript, RxJS, zone.js and Node point the other way and arrive with D1.
 */
export function analyze(
  dependencies: ProjectDependency[],
  packages: Record<string, RegistryPackage>,
): CeilingAnalysis {
  const current = currentAngularMajor(dependencies);
  const latest = latestAngularMajor(packages);

  const known: KnownDependency[] = [];
  const unknown: string[] = [];

  for (const dep of dependencies) {
    const pkg = packages[dep.name];
    const supported = pkg === undefined ? [] : toSupportedVersions(pkg);
    if (supported.length === 0) {
      unknown.push(dep.name);
      continue;
    }
    known.push({
      name: dep.name,
      installedVersion: lowestVersion(dep.requestedVersion) ?? dep.requestedVersion,
      supported,
    });
  }

  const result = solveCeiling(known, current, latest);
  const target = result.firstBlocked;

  const blockers: DependencyBlocker[] =
    target === undefined
      ? []
      : result.blocked.map((dep) => {
          const without = solveCeiling(
            known.filter((other) => other.name !== dep.name),
            current,
            latest,
          ).ceiling;
          return {
            packageName: dep.name,
            installedVersion: dep.installedVersion,
            targetAngularMajor: target,
            declaredSupport: declaredSupport(dep, latest),
            ceilingWithoutBlocker: without > result.ceiling ? without : undefined,
          };
        });

  return {
    currentAngularMajor: current,
    declaredCeiling: result.ceiling,
    latestAngularMajor: latest,
    firstBlockedMajor: target,
    blockers,
    unknownDependencies: [...unknown].sort(),
  };
}
