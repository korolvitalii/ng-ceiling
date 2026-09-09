import { describe, expect, it } from 'vitest';
import { renderReport } from '../src/report';
import type { CeilingAnalysis } from '../src/types';

const clean: CeilingAnalysis = {
  currentAngularMajor: 16,
  declaredCeiling: 20,
  latestAngularMajor: 20,
  firstBlockedMajor: undefined,
  blockers: [],
  toolchainBlockers: [],
  requiredUpgrades: [],
  unknownDependencies: [],
};

describe('renderReport — structure', () => {
  it('states the upper-bound caveat beside the ceiling number', () => {
    expect(renderReport(clean)).toContain('Declared ceiling         20  (upper bound)');
  });

  it('omits the first-blocked line when nothing blocks', () => {
    expect(renderReport(clean)).not.toContain('First blocked version');
  });

  it('omits Blockers, Toolchain and Upgrades sections when empty', () => {
    const out = renderReport(clean);
    expect(out).not.toContain('Blockers');
    expect(out).not.toContain('Toolchain');
    expect(out).not.toContain('Upgrades required');
    expect(out).not.toContain('Unverified');
  });

  it('uses the singular for one unverified dependency', () => {
    const out = renderReport({ ...clean, unknownDependencies: ['uuid'] });
    expect(out).toContain('1 dependency declares no Angular constraint.');
  });
});

describe('renderReport — a label longer than the value column', () => {
  const withLongUpgrade: CeilingAnalysis = {
    ...clean,
    currentAngularMajor: 17,
    requiredUpgrades: [
      {
        packageName: '@angular-devkit/build-angular', // 28 chars, > the 25-col
        installedVersion: '17.3.0',
        minCompatibleVersion: '20.0.0',
        targetMajor: 20,
      },
    ],
  };

  it('keeps a gap between the package name and the version', () => {
    const line = renderReport(withLongUpgrade)
      .split('\n')
      .find((l) => l.startsWith('@angular-devkit/build-angular'));
    expect(line).toBe('@angular-devkit/build-angular  17.3.0 → 20.0.0');
  });
});
