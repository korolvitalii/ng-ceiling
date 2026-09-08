import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCeiling } from '../src/app';
import { NgCeilingError } from '../src/errors';
import type { RegistryPackage } from '../src/types';

/**
 * End-to-end coverage: the real runCeiling pipeline — project reading, the real
 * fetchPackages with its abbreviated-packument mapping, the compatibility
 * engine, every reporter — driven against each committed fixture. Only the
 * network is faked: global.fetch serves each fixture's packuments.json,
 * re-encoded into the abbreviated wire shape the registry client parses.
 *
 * CI never touches the live registry (load-bearing rule 9); this is how the
 * whole stack stays covered without it.
 */
const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));

const readFixture = (name: string, file: string): string =>
  readFileSync(join(fixturesDir, name, file), 'utf8');

/** RegistryPackage (the internal shape stored in fixtures) → abbreviated packument. */
const toAbbreviated = (pkg: RegistryPackage): unknown => ({
  name: pkg.name,
  'dist-tags': pkg.distTags,
  versions: Object.fromEntries(
    pkg.versions.map(({ version, ...rest }) => [version, rest]),
  ),
});

/**
 * @angular/compiler-cli and @angular/cli are always fetched (they carry the
 * TypeScript peer and engines.node), but only the toolchain fixture needs their
 * data. Everywhere else they resolve to an empty packument rather than a 404,
 * so a run against a fixture that declares no toolchain axis reports nothing
 * "not found".
 */
const EMPTY_PACKUMENT: RegistryPackage = {
  name: '',
  distTags: { latest: '20.3.0' },
  versions: [],
};

const stubRegistry = (name: string): void => {
  const packages = JSON.parse(readFixture(name, 'packuments.json')) as Record<
    string,
    RegistryPackage
  >;

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const requested = decodeURIComponent(url.split('/').pop() ?? '');
      const pkg =
        packages[requested] ??
        (requested === '@angular/compiler-cli' || requested === '@angular/cli'
          ? { ...EMPTY_PACKUMENT, name: requested }
          : undefined);

      if (pkg === undefined) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(toAbbreviated(pkg)),
      });
    }),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const FIXTURES = [
  'angular-16-clean',
  'angular-16-hard-blocker',
  'angular-17-major-upgrade',
  'angular-17-typescript-blocked',
  'angular-18-multiple-blockers',
  'angular-18-all-unknown',
] as const;

describe.each(FIXTURES)('runCeiling against %s', (name) => {
  const cwd = join(fixturesDir, name);
  const base = { cwd, unknown: false, json: false };

  beforeEach(() => {
    stubRegistry(name);
  });

  it('produces the console golden', async () => {
    const { stdout } = await runCeiling(base);
    expect(stdout).toBe(readFixture(name, 'report.txt'));
  });

  it('produces the JSON golden', async () => {
    const { stdout } = await runCeiling({ ...base, json: true });
    expect(stdout).toBe(readFixture(name, 'report.json'));
  });

  it('produces the Markdown golden', async () => {
    const { stdout } = await runCeiling({ ...base, format: 'markdown' });
    expect(stdout).toBe(readFixture(name, 'report.md'));
  });

  it('reports nothing missing from the registry', async () => {
    const { diagnostics } = await runCeiling(base);
    expect(diagnostics.some((line) => line.includes('not found'))).toBe(false);
  });
});

describe('runCeiling — the invalid-project fixture', () => {
  it('is rejected as not an Angular project, before any network call', async () => {
    stubRegistry('angular-16-clean'); // any stub — it must not be reached
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const cwd = join(fixturesDir, 'invalid-project');
    await expect(
      runCeiling({ cwd, unknown: false, json: false }),
    ).rejects.toBeInstanceOf(NgCeilingError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('runCeiling — a dependency the registry does not have', () => {
  let scratch: string | undefined;
  afterEach(() => {
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
  });

  it('is named in the diagnostics and treated as unverified', async () => {
    // angular-18-all-unknown serves @angular/core; ghost-widget is in nobody's
    // packuments, so the real fetchPackages records it as a 404.
    stubRegistry('angular-18-all-unknown');

    scratch = mkdtempSync(join(tmpdir(), 'ng-ceiling-integration-'));
    writeFileSync(
      join(scratch, 'package.json'),
      JSON.stringify({
        dependencies: { '@angular/core': '18.2.13', 'ghost-widget': '1.0.0' },
      }),
    );

    const { stdout, diagnostics } = await runCeiling({
      cwd: scratch,
      unknown: false,
      json: false,
    });

    expect(
      diagnostics.some(
        (line) => line.includes('not found') && line.includes('ghost-widget'),
      ),
    ).toBe(true);
    expect(stdout).toContain('no Angular constraint');
  });
});
