import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCeiling } from '../src/app';
import { NgCeilingError } from '../src/errors';
import type { RegistryResult } from '../src/registry';
import type { RegistryPackage } from '../src/types';

const fixtureDir = fileURLToPath(
  new URL('../fixtures/angular-16-hard-blocker/', import.meta.url),
);
const fixturePackages = JSON.parse(
  readFileSync(`${fixtureDir}packuments.json`, 'utf8'),
) as Record<string, RegistryPackage>;

const stubFetch = (result: Partial<RegistryResult> = {}) =>
  vi.fn(
    (): Promise<RegistryResult> =>
      Promise.resolve({ packages: fixturePackages, notFound: [], ...result }),
  );

let scratch: string | undefined;
afterEach(() => {
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

const projectDir = (pkg: object): string => {
  scratch = mkdtempSync(join(tmpdir(), 'ng-ceiling-app-test-'));
  writeFileSync(join(scratch, 'package.json'), JSON.stringify(pkg));
  return scratch;
};

const base = { cwd: fixtureDir, unknown: false, json: false };

describe('runCeiling — happy path', () => {
  it('renders the console report against the hard-blocker fixture', async () => {
    const fetchPackages = stubFetch();
    const { stdout } = await runCeiling(base, { fetchPackages });

    expect(stdout).toBe(readFileSync(`${fixtureDir}report.txt`, 'utf8'));
    expect(fetchPackages).toHaveBeenCalledOnce();
  });

  it('routes --json and --format markdown to the right reporter', async () => {
    const json = await runCeiling({ ...base, json: true }, { fetchPackages: stubFetch() });
    expect(json.stdout).toBe(readFileSync(`${fixtureDir}report.json`, 'utf8'));

    const md = await runCeiling({ ...base, format: 'markdown' }, { fetchPackages: stubFetch() });
    expect(md.stdout.startsWith('# Angular Upgrade Ceiling')).toBe(true);
  });

  it('summarises the fetch, and names packages the registry did not have', async () => {
    const { diagnostics } = await runCeiling(base, {
      fetchPackages: stubFetch({ notFound: ['ngx-old-calendar', 'made-up'] }),
    });
    expect(diagnostics[0]).toMatch(/^fetched \d+ packuments/);
    expect(diagnostics[1]).toBe(
      'not found in the registry, treated as unverified: ngx-old-calendar, made-up',
    );
  });
});

describe('runCeiling — input errors', () => {
  it('rejects a project without @angular/core before touching the registry', async () => {
    const fetchPackages = stubFetch();
    const cwd = projectDir({ dependencies: { react: '^18.0.0' } });

    await expect(runCeiling({ ...base, cwd }, { fetchPackages })).rejects.toBeInstanceOf(
      NgCeilingError,
    );
    expect(fetchPackages).not.toHaveBeenCalled();
  });

  it('rejects an unreadable @angular/core range', async () => {
    const cwd = projectDir({ dependencies: { '@angular/core': 'garbage' } });
    await expect(
      runCeiling({ ...base, cwd }, { fetchPackages: stubFetch() }),
    ).rejects.toThrow('cannot read an Angular version');
  });

  it('rejects a missing package.json with a hint', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'ng-ceiling-app-test-'));
    await expect(
      runCeiling({ ...base, cwd: scratch }, { fetchPackages: stubFetch() }),
    ).rejects.toMatchObject({ hint: expect.stringContaining('--cwd') });
  });

  it('rejects an unknown --format', async () => {
    await expect(
      runCeiling({ ...base, format: 'yaml' }, { fetchPackages: stubFetch() }),
    ).rejects.toThrow('unknown --format "yaml"');
  });
});
