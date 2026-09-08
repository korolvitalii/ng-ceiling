/** One version's entry in an abbreviated npm packument. */
export interface RegistryPackageVersion {
  version: string;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  engines?: { node?: string };
  deprecated?: string;
}

/** An abbreviated packument, reduced to what the ceiling calculation needs. */
export interface RegistryPackage {
  name: string;
  distTags: Record<string, string>;
  versions: RegistryPackageVersion[];
}

/** A direct dependency as declared in the project's package.json. */
export interface ProjectDependency {
  name: string;
  requestedVersion: string;
}

/** A published version that declares an Angular peer constraint. */
export interface SupportedVersion {
  version: string;
  angularRange: string;
}

/**
 * A dependency whose Angular compatibility is measurable: at least one
 * published version declares an Angular peer. Dependencies that declare none
 * are UNKNOWN and are excluded from the ceiling entirely.
 */
export interface KnownDependency {
  name: string;
  installedVersion: string;
  /** The range from package.json — what the project would resolve without a bump. */
  requestedRange: string;
  supported: SupportedVersion[];
}

/**
 * A dependency the ceiling assumes will be upgraded: no version inside its
 * declared range supports the ceiling major, but a higher one does. It is not
 * a blocker — the ceiling is an optimistic upper bound — but reaching that
 * ceiling requires this bump. See "Dependency upgrade required" in the glossary.
 */
export interface RequiredUpgrade {
  packageName: string;
  installedVersion: string;
  /** The lowest published version that supports the ceiling major. */
  minCompatibleVersion: string;
  /** The major of minCompatibleVersion — the "bump to vN" number. */
  targetMajor: number;
}

export interface DependencyBlocker {
  packageName: string;
  installedVersion: string;
  targetAngularMajor: number;
  /** Human-readable summary of the highest major any version supports. */
  declaredSupport: string;
  /** The ceiling this project would reach if the blocker were removed. */
  ceilingWithoutBlocker?: number;
}

/**
 * Angular's peers point at its own toolchain, not at third-party packages:
 * TypeScript via @angular/compiler-cli, RxJS and zone.js via @angular/core,
 * Node via @angular/cli's engines.node. See
 * docs/agent-knowledge/toolchain-direction.md.
 */
export type ToolchainAxis = 'typescript' | 'rxjs' | 'zone.js' | 'node';

/**
 * .nvmrc, .node-version and the process.version fallback are all a single
 * pinned version, compared with `satisfies`. Only package.json's
 * engines.node is a real range, compared with `intersects` like every other
 * axis. `kind` is what tells the comparison which to use.
 */
export interface NodeVersionSource {
  value: string;
  kind: 'version' | 'range';
  source: 'nvmrc' | 'node-version' | 'engines' | 'process';
}

/** What the project declares for each axis Angular's own peers constrain. */
export interface DeclaredToolchain {
  typescript?: string;
  rxjs?: string;
  zoneJs?: string;
  node?: NodeVersionSource;
}

export interface ToolchainBlocker {
  axis: ToolchainAxis;
  /** The declared range, or the Node value, human-readable. */
  installed: string;
  /** Angular's requirement for this axis at targetAngularMajor. */
  requiredRange: string;
  targetAngularMajor: number;
  /** Present only when axis === 'node' — discloses a process.version fallback. */
  nodeSource?: NodeVersionSource['source'];
  ceilingWithoutBlocker?: number;
}

export interface CeilingAnalysis {
  currentAngularMajor: number;
  /** Optimistic upper bound — see the Limitations section of the README. */
  declaredCeiling: number;
  latestAngularMajor: number;
  firstBlockedMajor?: number;
  blockers: DependencyBlocker[];
  toolchainBlockers: ToolchainBlocker[];
  /** Known dependencies whose declared range must be bumped to reach the ceiling. */
  requiredUpgrades: RequiredUpgrade[];
  /** Excluded from the ceiling, never counted against it. */
  unknownDependencies: string[];
}
