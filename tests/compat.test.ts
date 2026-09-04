import { describe, expect, it } from 'vitest';
import {
  angularPeerRange,
  declaredSupport,
  findCompatibleVersion,
  rangeCoversMajor,
  solveCeiling,
} from '../src/compat';
import type { KnownDependency } from '../src/types';

const dep = (name: string, supported: [string, string][]): KnownDependency => ({
  name,
  installedVersion: supported[0]?.[0] ?? '0.0.0',
  supported: supported.map(([version, angularRange]) => ({ version, angularRange })),
});

describe('rangeCoversMajor', () => {
  it.each<[string, number, boolean]>([
    ['^18.0.0', 18, true],
    ['^18.0.0', 19, false],
    ['>=18 <21', 18, true],
    ['>=18 <21', 20, true],
    ['>=18 <21', 21, false],
    ['^17 || ^18', 17, true],
    ['^17 || ^18', 19, false],
    ['>=16', 22, true],
    ['*', 25, true],
    ['~18.2.0', 18, true],
    ['~18.2.0', 19, false],
    ['>=17.3 <20', 19, true],
    ['>=17.3 <20', 20, false],
  ])('%s covers Angular %i → %s', (range, major, expected) => {
    expect(rangeCoversMajor(range, major)).toBe(expected);
  });

  it('covers a major the range only partly spans', () => {
    // satisfies('17.0.0', '>=17.3 <20') is false, which would wrongly report
    // this package as incompatible with Angular 17.
    expect(rangeCoversMajor('>=17.3 <20', 17)).toBe(true);
  });
});

describe('angularPeerRange', () => {
  it('prefers @angular/core over other @angular packages', () => {
    expect(
      angularPeerRange({
        version: '1.0.0',
        peerDependencies: { '@angular/common': '^17.0.0', '@angular/core': '^18.0.0' },
      }),
    ).toBe('^18.0.0');
  });

  it('falls back to any other @angular peer', () => {
    expect(
      angularPeerRange({ version: '1.0.0', peerDependencies: { '@angular/common': '^17.0.0' } }),
    ).toBe('^17.0.0');
  });

  it('ignores an optional peer, which is never a blocker', () => {
    expect(
      angularPeerRange({
        version: '1.0.0',
        peerDependencies: { '@angular/core': '^16.0.0' },
        peerDependenciesMeta: { '@angular/core': { optional: true } },
      }),
    ).toBeUndefined();
  });

  it('treats a malformed range as unmeasured rather than incompatible', () => {
    expect(
      angularPeerRange({ version: '1.0.0', peerDependencies: { '@angular/core': 'latest-ish' } }),
    ).toBeUndefined();
  });

  it('returns nothing when no Angular peer is declared', () => {
    expect(
      angularPeerRange({ version: '1.0.0', peerDependencies: { rxjs: '^7.0.0' } }),
    ).toBeUndefined();
  });
});

describe('findCompatibleVersion', () => {
  const pkg = dep('ngx-thing', [
    ['5.0.0', '^16.0.0'],
    ['6.0.0', '^17.0.0'],
    ['6.1.0', '^17.0.0'],
    ['7.0.0-rc.0', '^18.0.0'],
    ['7.0.0', '^18.0.0'],
  ]);

  it('returns the lowest satisfying version', () => {
    expect(findCompatibleVersion(pkg, 17)).toBe('6.0.0');
  });

  it('skips prereleases when a stable version exists', () => {
    expect(findCompatibleVersion(pkg, 18)).toBe('7.0.0');
  });

  it('returns nothing when no version supports the major', () => {
    expect(findCompatibleVersion(pkg, 19)).toBeUndefined();
  });

  it('falls back to prereleases when the package has nothing else', () => {
    const preOnly = dep('ngx-new', [['1.0.0-next.1', '^19.0.0']]);
    expect(findCompatibleVersion(preOnly, 19)).toBe('1.0.0-next.1');
  });
});

describe('solveCeiling', () => {
  const healthy = dep('primeng', [
    ['17.0.0', '^17.0.0'],
    ['18.0.0', '^18.0.0'],
    ['19.0.0', '^19.0.0'],
    ['20.0.0', '^20.0.0'],
  ]);
  const stuck = dep('ngx-old-calendar', [
    ['7.0.0', '^17.0.0 || ^18.0.0'],
    ['7.2.0', '>=17.0.0 <19.0.0'],
  ]);

  it('stops at the first major some dependency cannot reach', () => {
    expect(solveCeiling([healthy, stuck], 16, 20)).toMatchObject({ ceiling: 18, firstBlocked: 19 });
  });

  it('names every dependency blocking that major', () => {
    expect(solveCeiling([healthy, stuck], 16, 20).blocked.map((d) => d.name)).toEqual([
      'ngx-old-calendar',
    ]);
  });

  it('reaches the latest major when nothing blocks', () => {
    const result = solveCeiling([healthy], 16, 20);
    expect(result.ceiling).toBe(20);
    expect(result.firstBlocked).toBeUndefined();
    expect(result.blocked).toEqual([]);
  });

  it('never reports a ceiling below the current major', () => {
    expect(solveCeiling([stuck], 18, 20).ceiling).toBe(18);
  });

  it('ignores dependencies that were removed, which is how unlock works', () => {
    expect(solveCeiling([healthy], 16, 20).ceiling).toBe(20);
  });
});

describe('declaredSupport', () => {
  it('reports the highest major any published version supports', () => {
    const stuck = dep('ngx-old-calendar', [
      ['6.0.0', '^16.0.0'],
      ['7.2.0', '>=17.0.0 <19.0.0'],
    ]);
    expect(declaredSupport(stuck, 20)).toBe('Angular <=18');
  });
});
