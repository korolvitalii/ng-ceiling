import { describe, expect, it } from 'vitest';
import { solveToolchainCeiling, toolchainFailuresAt } from '../src/toolchain-compat';
import type { DeclaredToolchain, RegistryPackage } from '../src/types';

/**
 * @angular/core@N peers rxjs and zone.js; @angular/compiler-cli@N peers
 * typescript; @angular/cli@N declares engines.node. Ranges below are real
 * npm data for majors 17-20 (see the D1 plan's verification step), so these
 * tests exercise the same shapes the real registry returns.
 */
const packages: Record<string, RegistryPackage> = {
  '@angular/core': {
    name: '@angular/core',
    distTags: { latest: '20.3.0' },
    versions: [
      { version: '17.3.12', peerDependencies: { rxjs: '^6.5.3 || ^7.4.0', 'zone.js': '~0.14.0' } },
      { version: '18.2.13', peerDependencies: { rxjs: '^6.5.3 || ^7.4.0', 'zone.js': '~0.14.10' } },
      {
        version: '19.2.14',
        peerDependencies: { rxjs: '^6.5.3 || ^7.4.0', 'zone.js': '~0.15.0' },
        peerDependenciesMeta: { 'zone.js': { optional: true } },
      },
      { version: '20.3.0', peerDependencies: { rxjs: '^6.5.3 || ^7.4.0', 'zone.js': '~0.15.0' } },
    ],
  },
  '@angular/compiler-cli': {
    name: '@angular/compiler-cli',
    distTags: { latest: '20.3.0' },
    versions: [
      { version: '17.3.12', peerDependencies: { typescript: '>=5.2 <5.5' } },
      { version: '18.2.13', peerDependencies: { typescript: '>=5.4 <5.6' } },
      { version: '19.2.14', peerDependencies: { typescript: '>=5.5 <5.9' } },
      { version: '20.3.0', peerDependencies: { typescript: '>=5.8 <6.0' } },
    ],
  },
  '@angular/cli': {
    name: '@angular/cli',
    distTags: { latest: '20.3.0' },
    versions: [
      { version: '17.3.12', engines: { node: '^18.13.0 || >=20.9.0' } },
      { version: '18.2.13', engines: { node: '^18.19.1 || ^20.11.1 || >=22.0.0' } },
      { version: '19.2.14', engines: { node: '^18.19.1 || ^20.11.1 || >=22.0.0' } },
      { version: '20.3.0', engines: { node: '^20.19.0 || ^22.12.0 || >=24.0.0' } },
    ],
  },
};

describe('toolchainFailuresAt', () => {
  it('fails typescript when the declared range does not reach the required one', () => {
    // 17.3.12 needs >=5.2 <5.5; the project only declares up to 5.1.
    const toolchain: DeclaredToolchain = { typescript: '~5.1.0' };
    const failures = toolchainFailuresAt(toolchain, packages, 17);
    expect(failures).toEqual([{ axis: 'typescript', installed: '~5.1.0', requiredRange: '>=5.2 <5.5' }]);
  });

  it('passes typescript when the declared range overlaps what is required', () => {
    const toolchain: DeclaredToolchain = { typescript: '~5.3.0' };
    expect(toolchainFailuresAt(toolchain, packages, 17)).toEqual([]);
  });

  it('fails rxjs the same way', () => {
    const toolchain: DeclaredToolchain = { rxjs: '^5.0.0' };
    expect(toolchainFailuresAt(toolchain, packages, 18)).toEqual([
      { axis: 'rxjs', installed: '^5.0.0', requiredRange: '^6.5.3 || ^7.4.0' },
    ]);
  });

  it('fails zone.js when declared and required do not overlap', () => {
    const toolchain: DeclaredToolchain = { zoneJs: '~0.11.0' };
    expect(toolchainFailuresAt(toolchain, packages, 18)).toEqual([
      { axis: 'zone.js', installed: '~0.11.0', requiredRange: '~0.14.10' },
    ]);
  });

  it('skips zone.js once Angular marks it optional, even if the declared range would fail', () => {
    // Angular 19's fixture entry marks zone.js optional (zoneless support).
    const toolchain: DeclaredToolchain = { zoneJs: '~0.11.0' };
    expect(toolchainFailuresAt(toolchain, packages, 19)).toEqual([]);
  });

  it('fails node against a required range when the value is a pinned version', () => {
    // .nvmrc-style: a single concrete version, compared with satisfies.
    const toolchain: DeclaredToolchain = {
      node: { value: '18.12.0', kind: 'version', source: 'nvmrc' },
    };
    expect(toolchainFailuresAt(toolchain, packages, 17)).toEqual([
      { axis: 'node', installed: '18.12.0', requiredRange: '^18.13.0 || >=20.9.0' },
    ]);
  });

  it('passes node when the pinned version satisfies the required range', () => {
    const toolchain: DeclaredToolchain = {
      node: { value: '20.9.0', kind: 'version', source: 'nvmrc' },
    };
    expect(toolchainFailuresAt(toolchain, packages, 17)).toEqual([]);
  });

  it('compares node with intersects, not satisfies, when the source is a package.json range', () => {
    // engines.node "^18" intersects "^18.13.0 || >=20.9.0" even though the
    // single version 18.0.0 would not satisfy it.
    const toolchain: DeclaredToolchain = {
      node: { value: '^18.0.0', kind: 'range', source: 'engines' },
    };
    expect(toolchainFailuresAt(toolchain, packages, 17)).toEqual([]);
  });

  it('fails node when a declared engines range does not intersect what is required', () => {
    const toolchain: DeclaredToolchain = {
      node: { value: '^16.0.0', kind: 'range', source: 'engines' },
    };
    expect(toolchainFailuresAt(toolchain, packages, 17)).toEqual([
      { axis: 'node', installed: '^16.0.0', requiredRange: '^18.13.0 || >=20.9.0' },
    ]);
  });

  it('treats an undeclared axis as unmeasurable, never a blocker', () => {
    // A zoneless project with no zone.js dependency at all.
    expect(toolchainFailuresAt({}, packages, 18)).toEqual([]);
  });

  it('reports every failing axis at once', () => {
    const toolchain: DeclaredToolchain = { typescript: '~5.1.0', rxjs: '^5.0.0' };
    const failures = toolchainFailuresAt(toolchain, packages, 17);
    expect(failures.map((f) => f.axis).sort()).toEqual(['rxjs', 'typescript']);
  });

  it('excludes an ignored axis, used by unlock analysis', () => {
    const toolchain: DeclaredToolchain = { typescript: '~5.1.0', rxjs: '^5.0.0' };
    const failures = toolchainFailuresAt(toolchain, packages, 17, 'typescript');
    expect(failures).toEqual([{ axis: 'rxjs', installed: '^5.0.0', requiredRange: '^6.5.3 || ^7.4.0' }]);
  });
});

describe('solveToolchainCeiling', () => {
  it('stops at the first major an axis fails', () => {
    // >=5.4 <5.5 overlaps 17's >=5.2<5.5 and 18's >=5.4<5.6, but not
    // 19's >=5.5<5.9 — the two ranges don't touch at all.
    const toolchain: DeclaredToolchain = { typescript: '>=5.4.0 <5.5.0' };
    expect(solveToolchainCeiling(toolchain, packages, 16, 20)).toMatchObject({
      ceiling: 18,
      firstBlocked: 19,
    });
  });

  it('reaches the latest major when every axis is fine throughout', () => {
    // Wide enough to overlap every major's required range from 17 to 20,
    // since the real ranges shift forward each major rather than nesting.
    const toolchain: DeclaredToolchain = {
      typescript: '>=5.2.0 <6.0.0',
      rxjs: '^7.4.0',
      zoneJs: '>=0.14.0 <0.16.0',
    };
    const result = solveToolchainCeiling(toolchain, packages, 16, 20);
    expect(result.ceiling).toBe(20);
    expect(result.firstBlocked).toBeUndefined();
  });

  it('ignoring the failing axis lets the walk reach further', () => {
    const toolchain: DeclaredToolchain = { typescript: '>=5.4.0 <5.5.0' };
    const withoutTypescript = solveToolchainCeiling(toolchain, packages, 16, 20, 'typescript');
    expect(withoutTypescript.firstBlocked).toBeUndefined();
    expect(withoutTypescript.ceiling).toBe(20);
  });
});
