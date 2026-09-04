import { describe, expect, it } from 'vitest';
import {
  angularPeerRange,
  declaredSupport,
  findCompatibleVersion,
  rangeCoversMajor,
  solveCeiling,
  toSupportedVersions,
} from '../src/compat';
import type { KnownDependency, RegistryPackage } from '../src/types';

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

describe('toSupportedVersions', () => {
  const pkg = (
    name: string,
    versions: RegistryPackage['versions'],
    latest: string,
  ): RegistryPackage => ({ name, distTags: { latest }, versions });

  it('measures a package whose newest version declares an Angular peer', () => {
    const measured = toSupportedVersions(
      pkg(
        'primeng',
        [
          { version: '16.0.0', peerDependencies: { '@angular/core': '^16.0.0' } },
          { version: '20.0.0', peerDependencies: { '@angular/core': '^20.0.0' } },
        ],
        '20.0.0',
      ),
    );
    expect(measured.map((entry) => entry.angularRange)).toEqual(['^16.0.0', '^20.0.0']);
  });

  it('treats a package that stopped declaring an Angular peer as unmeasured', () => {
    // @angular-eslint/eslint-plugin and ng2-ckeditor both do this. Judging them
    // on their stale versions would report a hard blocker for a package that
    // merely stopped saying which Angular it supports.
    const measured = toSupportedVersions(
      pkg(
        'ng2-ckeditor',
        [
          { version: '1.0.0', peerDependencies: { '@angular/core': '^13.0.0' } },
          { version: '1.2.9', peerDependencies: { '@types/ckeditor': '^4.9.10' } },
        ],
        '1.2.9',
      ),
    );
    expect(measured).toEqual([]);
  });

  it('falls back to lockstep versioning for Angular packages with only optional peers', () => {
    // @angular/core declares @angular/compiler as an optional peer, so nothing
    // measurable remains; its own major is the Angular major.
    const measured = toSupportedVersions(
      pkg(
        '@angular/core',
        [
          {
            version: '19.2.14',
            peerDependencies: { '@angular/compiler': '19.2.14' },
            peerDependenciesMeta: { '@angular/compiler': { optional: true } },
          },
        ],
        '19.2.14',
      ),
    );
    expect(measured).toEqual([{ version: '19.2.14', angularRange: '>=19.0.0 <20.0.0' }]);
  });

  it('falls back to lockstep for an Angular package with no peers at all', () => {
    const measured = toSupportedVersions(
      pkg('@angular/compiler', [{ version: '22.1.3' }], '22.1.3'),
    );
    expect(measured).toEqual([{ version: '22.1.3', angularRange: '>=22.0.0 <23.0.0' }]);
  });

  it('prefers a declared peer over lockstep inside the @angular scope', () => {
    // @angular/fire lives in the scope but is not on the lockstep train.
    const measured = toSupportedVersions(
      pkg(
        '@angular/fire',
        [{ version: '19.0.0', peerDependencies: { '@angular/core': '^20.0.0' } }],
        '19.0.0',
      ),
    );
    expect(measured).toEqual([{ version: '19.0.0', angularRange: '^20.0.0' }]);
  });
});
