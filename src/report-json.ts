import type { CeilingAnalysis } from './types';

/**
 * The machine-readable shape. Stable field names — anything consuming this in
 * CI or another tool depends on them not drifting.
 *
 * `ceilingIsUpperBound` is always true in V1: the tool computes declared
 * compatibility only, never resolvable or verified. It stays in the payload
 * so a consumer never has to know that to read the number correctly.
 */
export interface JsonReport {
  currentAngular: number;
  latestAngular: number;
  ceiling: number;
  ceilingIsUpperBound: true;
  firstBlocked: number | null;
  blockers: JsonBlocker[];
  toolchainBlockers: JsonToolchainBlocker[];
  requiredUpgrades: JsonRequiredUpgrade[];
  unknownCount: number;
  unknown: string[];
}

export interface JsonBlocker {
  package: string;
  installed: string;
  declaredSupport: string;
  blockedAt: number;
  ceilingIfReplaced: number | null;
}

export interface JsonToolchainBlocker {
  axis: 'typescript' | 'rxjs' | 'zone.js' | 'node';
  declared: string;
  required: string;
  blockedAt: number;
  nodeSource: string | null;
  ceilingIfUpgraded: number | null;
}

export interface JsonRequiredUpgrade {
  package: string;
  installed: string;
  minVersion: string;
  targetMajor: number;
}

/** Builds the JSON payload. Pure: same analysis in, same object out. */
export function toJsonReport(analysis: CeilingAnalysis): JsonReport {
  return {
    currentAngular: analysis.currentAngularMajor,
    latestAngular: analysis.latestAngularMajor,
    ceiling: analysis.declaredCeiling,
    ceilingIsUpperBound: true,
    firstBlocked: analysis.firstBlockedMajor ?? null,
    blockers: analysis.blockers.map((blocker) => ({
      package: blocker.packageName,
      installed: blocker.installedVersion,
      declaredSupport: blocker.declaredSupport,
      blockedAt: blocker.targetAngularMajor,
      ceilingIfReplaced: blocker.ceilingWithoutBlocker ?? null,
    })),
    toolchainBlockers: analysis.toolchainBlockers.map((blocker) => ({
      axis: blocker.axis,
      declared: blocker.installed,
      required: blocker.requiredRange,
      blockedAt: blocker.targetAngularMajor,
      nodeSource: blocker.nodeSource ?? null,
      ceilingIfUpgraded: blocker.ceilingWithoutBlocker ?? null,
    })),
    requiredUpgrades: analysis.requiredUpgrades.map((upgrade) => ({
      package: upgrade.packageName,
      installed: upgrade.installedVersion,
      minVersion: upgrade.minCompatibleVersion,
      targetMajor: upgrade.targetMajor,
    })),
    unknownCount: analysis.unknownDependencies.length,
    unknown: analysis.unknownDependencies,
  };
}

/** Two-space-indented JSON with a trailing newline, matching the console reporter. */
export function renderJsonReport(analysis: CeilingAnalysis): string {
  return `${JSON.stringify(toJsonReport(analysis), null, 2)}\n`;
}
