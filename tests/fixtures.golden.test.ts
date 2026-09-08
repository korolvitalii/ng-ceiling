import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/compat';
import { readDeclaredToolchain, toDependencies, type PackageJson } from '../src/project';
import { renderReport } from '../src/report';
import { renderJsonReport } from '../src/report-json';
import { renderMarkdownReport } from '../src/report-markdown';
import type { RegistryPackage } from '../src/types';

/**
 * Every fixture that carries a packuments.json is rendered in all three formats
 * and compared byte for byte against its committed goldens. The fixture set is
 * frozen here (D9) — a new fixture is a deliberate addition, and a golden that
 * needs regenerating is a deliberate output change, recorded in
 * docs/agent-knowledge/output-spec.md.
 *
 * The toolchain axis (typescript / rxjs / zone.js / Node) is read from each
 * fixture directory on disk via readDeclaredToolchain, exactly as the CLI does,
 * so a fixture's .nvmrc and its golden can never drift apart.
 */
const FIXTURES = [
  'angular-16-clean',
  'angular-16-hard-blocker',
  'angular-17-major-upgrade',
  'angular-17-typescript-blocked',
  'angular-18-multiple-blockers',
  'angular-18-all-unknown',
] as const;

describe.each(FIXTURES)('fixture %s', (name) => {
  const dir = fileURLToPath(new URL(`../fixtures/${name}/`, import.meta.url));
  const read = (file: string): string => readFileSync(`${dir}${file}`, 'utf8');

  const pkg = JSON.parse(read('package.json')) as PackageJson;
  const packages = JSON.parse(read('packuments.json')) as Record<string, RegistryPackage>;
  const analysis = analyze(toDependencies(pkg), packages, readDeclaredToolchain(dir, pkg));

  it('renders the console golden', () => {
    expect(renderReport(analysis)).toBe(read('report.txt'));
  });

  it('renders the JSON golden', () => {
    expect(renderJsonReport(analysis)).toBe(read('report.json'));
  });

  it('renders the Markdown golden', () => {
    expect(renderMarkdownReport(analysis)).toBe(read('report.md'));
  });
});
