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
  supported: SupportedVersion[];
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

export interface CeilingAnalysis {
  currentAngularMajor: number;
  /** Optimistic upper bound — see the Limitations section of the README. */
  declaredCeiling: number;
  latestAngularMajor: number;
  firstBlockedMajor?: number;
  blockers: DependencyBlocker[];
  /** Excluded from the ceiling, never counted against it. */
  unknownDependencies: string[];
}
