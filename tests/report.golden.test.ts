import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { analyze } from '../src/compat';
import { toDependencies, type PackageJson } from '../src/project';
import { renderReport } from '../src/report';
import type { RegistryPackage } from '../src/types';

const read = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../fixtures/angular-16-hard-blocker/${name}`, import.meta.url)),
    'utf8',
  );

const dependencies = toDependencies(JSON.parse(read('package.json')) as PackageJson);
const packages = JSON.parse(read('packuments.json')) as Record<string, RegistryPackage>;

/**
 * report.txt is the specification report from IMPLEMENTATION_PLAN.md §1, plus
 * the "Upgrades required" section added deliberately in D5 (plan §D5) and
 * recorded in docs/agent-knowledge/output-spec.md. This comparison is byte for
 * byte on purpose: the column alignment and box-drawing characters are part of
 * the spec.
 */
it('renders the specified report for the hard-blocker fixture', () => {
  expect(renderReport(analyze(dependencies, packages, {}))).toBe(read('report.txt'));
});

it('lists the unverified dependencies behind --unknown', () => {
  const output = renderReport(analyze(dependencies, packages, {}), { listUnknown: true });
  expect(output).toContain('  date-fns');
  expect(output).toContain('  lodash-es');
  expect(output).toContain('  uuid');
  expect(output).not.toContain('Run with --unknown');
});

it('computes the numbers the report is built from', () => {
  const analysis = analyze(dependencies, packages, {});
  expect(analysis).toMatchObject({
    currentAngularMajor: 16,
    declaredCeiling: 18,
    latestAngularMajor: 20,
    firstBlockedMajor: 19,
    unknownDependencies: ['date-fns', 'lodash-es', 'uuid'],
  });
  expect(analysis.blockers).toEqual([
    {
      packageName: 'ngx-old-calendar',
      installedVersion: '7.2.0',
      targetAngularMajor: 19,
      declaredSupport: 'Angular 15-18',
      ceilingWithoutBlocker: 20,
    },
  ]);
  // primeng@16 and @ngrx/store@16 don't block Angular 18 — a compatible version
  // exists — but the installed range can't reach it, so the ceiling assumes a bump.
  expect(analysis.requiredUpgrades).toEqual([
    {
      packageName: '@ngrx/store',
      installedVersion: '16.3.0',
      minCompatibleVersion: '18.1.1',
      targetMajor: 18,
    },
    {
      packageName: 'primeng',
      installedVersion: '16.9.1',
      minCompatibleVersion: '18.0.2',
      targetMajor: 18,
    },
  ]);
});
