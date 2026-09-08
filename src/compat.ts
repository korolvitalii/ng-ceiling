import semver from 'semver';
import { NgCeilingError } from './errors';
import { solveToolchainCeiling, toolchainFailuresAt } from './toolchain-compat';
import type {
  CeilingAnalysis,
  DeclaredToolchain,
  DependencyBlocker,
  KnownDependency,
  ProjectDependency,
  RegistryPackage,
  RegistryPackageVersion,
  RequiredUpgrade,
  SupportedVersion,
  ToolchainBlocker,
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

/** Every published version that declares a measurable Angular peer, ascending. */
function declaredVersions(pkg: RegistryPackage): SupportedVersion[] {
  return pkg.versions
    .filter((entry) => semver.valid(entry.version) !== null)
    .flatMap((entry) => {
      const angularRange = angularPeerRange(entry);
      return angularRange === undefined ? [] : [{ version: entry.version, angularRange }];
    })
    .sort((a, b) => semver.compare(a.version, b.version));
}

/** The version a project would upgrade to: the latest dist-tag, else the highest stable. */
export function newestVersion(pkg: RegistryPackage): string | undefined {
  const tagged = pkg.distTags['latest'];
  if (tagged !== undefined && semver.valid(tagged) !== null) return tagged;

  return pkg.versions
    .map((entry) => entry.version)
    .filter((version) => semver.valid(version) !== null && semver.prerelease(version) === null)
    .sort(semver.compare)
    .at(-1);
}

/**
 * Angular ships its own packages in lockstep with the framework major, so
 * @angular/thing@N supports Angular N by construction. Used only as a fallback:
 * @angular/core declares its @angular/compiler peer as optional and
 * @angular/compiler declares no peers at all, so neither is measurable from
 * peer metadata alone. Packages in the scope that do declare a real peer —
 * @angular/fire, which is not on the lockstep train — are measured from it.
 */
function lockstepVersions(pkg: RegistryPackage): SupportedVersion[] {
  return pkg.versions
    .filter((entry) => semver.valid(entry.version) !== null)
    .map((entry) => {
      const major = semver.major(entry.version);
      return { version: entry.version, angularRange: `>=${major}.0.0 <${major + 1}.0.0` };
    })
    .sort((a, b) => semver.compare(a.version, b.version));
}

/**
 * The versions this package's Angular compatibility can be measured from, or an
 * empty list when it cannot be measured at all.
 *
 * Measurability is decided by the NEWEST published version, not by any version.
 * Packages such as @angular-eslint/eslint-plugin and ng2-ckeditor declared an
 * Angular peer years ago and no longer do; judging them on those stale versions
 * reports "no version supports Angular 16" for packages that simply stopped
 * saying. Unmeasured is not incompatible, so they become UNKNOWN instead and
 * are excluded from the ceiling.
 */
export function toSupportedVersions(pkg: RegistryPackage): SupportedVersion[] {
  const declared = declaredVersions(pkg);
  const newest = newestVersion(pkg);

  if (newest !== undefined && declared.some((entry) => entry.version === newest)) return declared;
  if (pkg.name.startsWith(ANGULAR_SCOPE)) return lockstepVersions(pkg);
  return [];
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

/**
 * The span of Angular majors any published version of this package supports.
 *
 * Some real packages (@angular/pwa, @ngrx/store-devtools) only started
 * declaring an @angular/* peer directly partway through their history — every
 * version below that point has no measurable peer at all. Reporting "Angular
 * <=N" for those would imply continuous support back to Angular 1, directly
 * beside a "Compatible Angular <lower>: NONE" line for the same package —
 * self-contradictory, and a violation of the ceiling's honesty guarantee. The
 * lower bound is only omitted when coverage genuinely starts at Angular 1.
 */
export function declaredSupport(dep: KnownDependency, upTo: number): string {
  let lowest = 0;
  let highest = 0;
  for (let major = 1; major <= upTo; major++) {
    if (findCompatibleVersion(dep, major) !== undefined) {
      if (lowest === 0) lowest = major;
      highest = major;
    }
  }
  if (highest === 0) return 'Angular (none declared)';
  return lowest === 1 ? `Angular <=${highest}` : `Angular ${lowest}-${highest}`;
}

/** Every known dependency with no compatible published version at this major. */
export function dependenciesBlockedAt(deps: KnownDependency[], major: number): KnownDependency[] {
  return deps.filter((dep) => findCompatibleVersion(dep, major) === undefined);
}

/** The published versions of a dependency that satisfy the project's declared range. */
function versionsInRange(dep: KnownDependency): SupportedVersion[] {
  if (semver.validRange(dep.requestedRange) === null) {
    return dep.supported.filter((entry) => entry.version === dep.installedVersion);
  }
  return dep.supported.filter((entry) => semver.satisfies(entry.version, dep.requestedRange));
}

/**
 * The lowest published version that both supports `major` and is an actual
 * upgrade from what is installed. Peer histories are not always monotonic — a
 * package can support Angular N at v5, drop it at v6, and pick it up again at
 * v7 — so `findCompatibleVersion` (the oldest match, used for the ceiling walk)
 * would point a v6 project at v5. That is a downgrade, never a recommendation.
 */
function lowestForwardUpgrade(dep: KnownDependency, major: number): string | undefined {
  const stable = dep.supported.filter((entry) => semver.prerelease(entry.version) === null);
  const candidates = stable.length > 0 ? stable : dep.supported;
  return candidates.find(
    (entry) =>
      semver.gt(entry.version, dep.installedVersion) && rangeCoversMajor(entry.angularRange, major),
  )?.version;
}

/**
 * The dependencies whose declared range must be bumped to reach `major`: no
 * version they would resolve to today supports it, but a higher one does.
 *
 * `@angular/*` packages are excluded — they move in lockstep with the framework
 * major, so upgrading Angular upgrades them by definition and listing them is
 * noise. A dependency with no compatible version at all is a hard blocker, not
 * an upgrade, and is left to the blocker analysis. A dependency whose only
 * compatible versions are *older* than what is installed is skipped too — there
 * is no forward move to recommend.
 */
export function requiredUpgradesAt(deps: KnownDependency[], major: number): RequiredUpgrade[] {
  const upgrades: RequiredUpgrade[] = [];

  for (const dep of deps) {
    if (dep.name.startsWith(ANGULAR_SCOPE)) continue;
    if (versionsInRange(dep).some((entry) => rangeCoversMajor(entry.angularRange, major))) continue;

    const minCompatibleVersion = lowestForwardUpgrade(dep, major);
    if (minCompatibleVersion === undefined) continue;

    upgrades.push({
      packageName: dep.name,
      installedVersion: dep.installedVersion,
      minCompatibleVersion,
      targetMajor: semver.major(minCompatibleVersion),
    });
  }

  return upgrades.sort((a, b) => a.packageName.localeCompare(b.packageName));
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
    const blocked = dependenciesBlockedAt(deps, major);
    if (blocked.length > 0) return { ceiling: major - 1, firstBlocked: major, blocked };
  }
  return { ceiling: Math.max(current, latest), blocked: [] };
}

/** The lower of two possibly-absent blocked majors — either side may not fire. */
function combinedFirstBlocked(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

export function currentAngularMajor(dependencies: ProjectDependency[]): number {
  const core = dependencies.find((dep) => dep.name === ANGULAR_CORE);
  if (core === undefined) {
    throw new NgCeilingError('not an Angular project: no @angular/core dependency', {
      hint: 'ng-ceiling analyses Angular applications; @angular/core must be a direct dependency',
    });
  }

  const lowest = lowestVersion(core.requestedVersion);
  if (lowest === undefined) {
    throw new NgCeilingError(
      `cannot read an Angular version from the @angular/core range "${core.requestedVersion}"`,
      { hint: 'the version must be a valid SemVer range, e.g. "^17.3.0" or "17.3.12"' },
    );
  }
  return semver.major(lowest);
}

/** Never hardcoded — always read from the @angular/core dist-tags. */
export function latestAngularMajor(packages: Record<string, RegistryPackage>): number {
  const latest = packages[ANGULAR_CORE]?.distTags['latest'];
  const parsed = latest === undefined ? null : semver.parse(latest);
  if (parsed === null) {
    throw new NgCeilingError('cannot read the latest Angular major from the @angular/core dist-tags', {
      hint: 'the npm registry returned no usable "latest" tag for @angular/core — try again shortly',
    });
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
 * Third-party dependencies and Angular's own toolchain (TypeScript, RxJS,
 * zone.js, Node — see toolchain-compat.ts) are two independent walks,
 * combined by taking the minimum blocked major. Blockers are always
 * recomputed at that exact combined major, never read off whichever walk
 * found it first: if toolchain blocks at 17 and a dependency would only have
 * blocked at 19, that dependency must not be reported as a blocker at all.
 * The same recompute makes unlock analysis correct too — removing a
 * dependency blocker can't report an unlock the toolchain would still cap.
 */
export function analyze(
  dependencies: ProjectDependency[],
  packages: Record<string, RegistryPackage>,
  toolchain: DeclaredToolchain,
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
      requestedRange: dep.requestedVersion,
      supported,
    });
  }

  const depResult = solveCeiling(known, current, latest);
  const toolResult = solveToolchainCeiling(toolchain, packages, current, latest);

  const firstBlocked = combinedFirstBlocked(depResult.firstBlocked, toolResult.firstBlocked);
  const declaredCeiling = firstBlocked !== undefined ? firstBlocked - 1 : Math.max(current, latest);

  const blockedDeps = firstBlocked === undefined ? [] : dependenciesBlockedAt(known, firstBlocked);
  const blockedToolchain =
    firstBlocked === undefined ? [] : toolchainFailuresAt(toolchain, packages, firstBlocked);

  const blockers: DependencyBlocker[] = blockedDeps.map((dep) => {
    const without = combinedFirstBlocked(
      solveCeiling(
        known.filter((other) => other.name !== dep.name),
        current,
        latest,
      ).firstBlocked,
      toolResult.firstBlocked,
    );
    const withoutCeiling = without !== undefined ? without - 1 : Math.max(current, latest);
    return {
      packageName: dep.name,
      installedVersion: dep.installedVersion,
      targetAngularMajor: firstBlocked!,
      declaredSupport: declaredSupport(dep, latest),
      ceilingWithoutBlocker: withoutCeiling > declaredCeiling ? withoutCeiling : undefined,
    };
  });

  const toolchainBlockers: ToolchainBlocker[] = blockedToolchain.map((failure) => {
    const without = combinedFirstBlocked(
      depResult.firstBlocked,
      solveToolchainCeiling(toolchain, packages, current, latest, failure.axis).firstBlocked,
    );
    const withoutCeiling = without !== undefined ? without - 1 : Math.max(current, latest);
    return {
      axis: failure.axis,
      installed: failure.installed,
      requiredRange: failure.requiredRange,
      targetAngularMajor: firstBlocked!,
      nodeSource: failure.axis === 'node' ? toolchain.node?.source : undefined,
      ceilingWithoutBlocker: withoutCeiling > declaredCeiling ? withoutCeiling : undefined,
    };
  });

  // What it takes to reach the ceiling the tool just reported — computed at that
  // major, not at firstBlocked, and only when the ceiling is actually above the
  // current major (otherwise the project is already there and owes nothing).
  const requiredUpgrades =
    declaredCeiling > current ? requiredUpgradesAt(known, declaredCeiling) : [];

  return {
    currentAngularMajor: current,
    declaredCeiling,
    latestAngularMajor: latest,
    firstBlockedMajor: firstBlocked,
    blockers,
    toolchainBlockers,
    requiredUpgrades,
    unknownDependencies: [...unknown].sort(),
  };
}
