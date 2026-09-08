import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/compat';
import { readDeclaredToolchain, toDependencies, type PackageJson } from '../src/project';
import { renderJsonReport, toJsonReport } from '../src/report-json';
import type { CeilingAnalysis, RegistryPackage } from '../src/types';

const fixture = (dir: string, name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${dir}/${name}`, import.meta.url)), 'utf8');

const analyzeFixture = (dir: string): CeilingAnalysis => {
  const pkg = JSON.parse(fixture(dir, 'package.json')) as PackageJson;
  const packages = JSON.parse(fixture(dir, 'packuments.json')) as Record<string, RegistryPackage>;
  const base = fileURLToPath(new URL(`../fixtures/${dir}/`, import.meta.url));
  return analyze(toDependencies(pkg), packages, readDeclaredToolchain(base, pkg));
};

describe('golden JSON reports', () => {
  it('matches report.json for the hard-blocker fixture byte for byte', () => {
    expect(renderJsonReport(analyzeFixture('angular-16-hard-blocker'))).toBe(
      fixture('angular-16-hard-blocker', 'report.json'),
    );
  });

  it('matches report.json for the typescript-blocked fixture byte for byte', () => {
    expect(renderJsonReport(analyzeFixture('angular-17-typescript-blocked'))).toBe(
      fixture('angular-17-typescript-blocked', 'report.json'),
    );
  });
});

it('is valid, two-space-indented JSON with a trailing newline', () => {
  const out = renderJsonReport(analyzeFixture('angular-16-hard-blocker'));
  expect(out.endsWith('\n')).toBe(true);
  expect(() => JSON.parse(out)).not.toThrow();
  expect(out).toContain('\n  "ceiling": 18');
});

describe('toJsonReport shape', () => {
  const clean: CeilingAnalysis = {
    currentAngularMajor: 18,
    declaredCeiling: 20,
    latestAngularMajor: 20,
    firstBlockedMajor: undefined,
    blockers: [],
    toolchainBlockers: [],
    unknownDependencies: [],
  };

  it('reports firstBlocked as null when nothing blocks', () => {
    expect(toJsonReport(clean).firstBlocked).toBeNull();
  });

  it('always marks the ceiling as an upper bound', () => {
    expect(toJsonReport(clean).ceilingIsUpperBound).toBe(true);
  });

  it('carries unknown dependencies as both a count and the list', () => {
    const report = toJsonReport({ ...clean, unknownDependencies: ['a', 'b'] });
    expect(report.unknownCount).toBe(2);
    expect(report.unknown).toEqual(['a', 'b']);
  });

  it('maps a missing unlock to null, not an absent key', () => {
    const report = toJsonReport({
      ...clean,
      firstBlockedMajor: 19,
      blockers: [
        {
          packageName: 'ngx-thing',
          installedVersion: '1.0.0',
          targetAngularMajor: 19,
          declaredSupport: 'Angular <=18',
          ceilingWithoutBlocker: undefined,
        },
      ],
    });
    expect(report.blockers[0]).toMatchObject({ package: 'ngx-thing', ceilingIfReplaced: null });
  });

  it('discloses a process.version Node fallback in the toolchain blocker', () => {
    const report = toJsonReport({
      ...clean,
      firstBlockedMajor: 19,
      toolchainBlockers: [
        {
          axis: 'node',
          installed: '18.0.0',
          requiredRange: '>=20.11.1',
          targetAngularMajor: 19,
          nodeSource: 'process',
          ceilingWithoutBlocker: undefined,
        },
      ],
    });
    expect(report.toolchainBlockers[0]).toMatchObject({
      axis: 'node',
      nodeSource: 'process',
      ceilingIfUpgraded: null,
    });
  });
});
