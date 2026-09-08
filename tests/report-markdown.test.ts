import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/compat';
import { readDeclaredToolchain, toDependencies, type PackageJson } from '../src/project';
import { renderMarkdownReport } from '../src/report-markdown';
import type { CeilingAnalysis, RegistryPackage } from '../src/types';

const fixture = (dir: string, name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${dir}/${name}`, import.meta.url)), 'utf8');

const analyzeFixture = (dir: string): CeilingAnalysis => {
  const pkg = JSON.parse(fixture(dir, 'package.json')) as PackageJson;
  const packages = JSON.parse(fixture(dir, 'packuments.json')) as Record<string, RegistryPackage>;
  const base = fileURLToPath(new URL(`../fixtures/${dir}/`, import.meta.url));
  return analyze(toDependencies(pkg), packages, readDeclaredToolchain(base, pkg));
};

describe('golden Markdown reports', () => {
  it('matches report.md for the hard-blocker fixture byte for byte', () => {
    expect(
      renderMarkdownReport(analyzeFixture('angular-16-hard-blocker'), { listUnknown: true }),
    ).toBe(fixture('angular-16-hard-blocker', 'report.md'));
  });

  it('matches report.md for the typescript-blocked fixture byte for byte', () => {
    expect(
      renderMarkdownReport(analyzeFixture('angular-17-typescript-blocked'), { listUnknown: true }),
    ).toBe(fixture('angular-17-typescript-blocked', 'report.md'));
  });
});

const clean: CeilingAnalysis = {
  currentAngularMajor: 18,
  declaredCeiling: 20,
  latestAngularMajor: 20,
  firstBlockedMajor: undefined,
  blockers: [],
  toolchainBlockers: [],
  requiredUpgrades: [],
  unknownDependencies: [],
};

describe('Markdown structure', () => {
  it('states the upper-bound caveat beside the number and again in the footer', () => {
    const out = renderMarkdownReport(clean);
    expect(out).toContain('| Declared ceiling | **20** (upper bound) |');
    expect(out.trimEnd().endsWith('excluded from it.')).toBe(true);
  });

  it('omits the first-blocked row when nothing blocks', () => {
    expect(renderMarkdownReport(clean)).not.toContain('First blocked version');
  });

  it('omits Blockers and Toolchain sections when there are none', () => {
    const out = renderMarkdownReport(clean);
    expect(out).not.toContain('## Blockers');
    expect(out).not.toContain('## Toolchain');
  });

  it('hides the unknown list without listUnknown, shows it with', () => {
    const withUnknown = { ...clean, unknownDependencies: ['date-fns', 'uuid'] };
    expect(renderMarkdownReport(withUnknown)).toContain('Run with `--unknown` to list them.');
    const listed = renderMarkdownReport(withUnknown, { listUnknown: true });
    expect(listed).toContain('- date-fns');
    expect(listed).not.toContain('Run with `--unknown`');
  });

  it('uses the singular for a single unverified dependency', () => {
    expect(renderMarkdownReport({ ...clean, unknownDependencies: ['uuid'] })).toContain(
      '1 dependency declares no Angular constraint. It is excluded',
    );
  });

  it('labels a process.version Node fallback', () => {
    const out = renderMarkdownReport({
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
    expect(out).toContain('### Node.js');
    expect(out).toContain('process.version — no .nvmrc');
  });
});
