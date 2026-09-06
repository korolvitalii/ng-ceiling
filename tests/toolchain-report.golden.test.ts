import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { analyze } from '../src/compat';
import { readDeclaredToolchain, toDependencies, type PackageJson } from '../src/project';
import { renderReport } from '../src/report';
import type { RegistryPackage } from '../src/types';

const fixtureDir = fileURLToPath(new URL('../fixtures/angular-17-typescript-blocked/', import.meta.url));
const read = (name: string): string => readFileSync(`${fixtureDir}${name}`, 'utf8');

const pkg = JSON.parse(read('package.json')) as PackageJson;
const dependencies = toDependencies(pkg);
const packages = JSON.parse(read('packuments.json')) as Record<string, RegistryPackage>;

/**
 * Uses readDeclaredToolchain against the real fixture directory (not a
 * hand-built DeclaredToolchain) so the .nvmrc on disk and what the test
 * asserts can never drift apart. .nvmrc pins Node to a version that satisfies
 * every major's engines.node here, so Node never becomes a second blocker —
 * this fixture isolates the typescript axis on purpose.
 */
const toolchain = readDeclaredToolchain(fixtureDir, pkg);

it('renders a Toolchain section, visually separate from Blockers, with no dependency blockers', () => {
  expect(renderReport(analyze(dependencies, packages, toolchain))).toBe(read('report.txt'));
});

it('computes the numbers the toolchain-blocked report is built from', () => {
  const analysis = analyze(dependencies, packages, toolchain);
  expect(analysis).toMatchObject({
    currentAngularMajor: 17,
    declaredCeiling: 18,
    latestAngularMajor: 20,
    firstBlockedMajor: 19,
    blockers: [],
    unknownDependencies: [],
  });
  expect(analysis.toolchainBlockers).toEqual([
    {
      axis: 'typescript',
      installed: '~5.4.0',
      requiredRange: '>=5.5 <5.9',
      targetAngularMajor: 19,
      nodeSource: undefined,
      ceilingWithoutBlocker: 20,
    },
  ]);
});
