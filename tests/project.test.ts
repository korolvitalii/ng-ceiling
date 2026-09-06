import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDeclaredToolchain, readPackageJson, toDependencies, type PackageJson } from '../src/project';

let dir: string | undefined;

function tempProject(files: Record<string, string> = {}): string {
  dir = mkdtempSync(join(tmpdir(), 'ng-ceiling-project-test-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('readPackageJson', () => {
  it('throws a plain message when package.json is missing', () => {
    const cwd = tempProject();
    expect(() => readPackageJson(cwd)).toThrow('no package.json found');
  });

  it('throws a plain message when package.json is not valid JSON', () => {
    const cwd = tempProject({ 'package.json': '{ not json' });
    expect(() => readPackageJson(cwd)).toThrow('is not valid JSON');
  });

  it('parses a well-formed package.json', () => {
    const cwd = tempProject({ 'package.json': '{"dependencies":{"@angular/core":"17.0.0"}}' });
    expect(readPackageJson(cwd)).toEqual({ dependencies: { '@angular/core': '17.0.0' } });
  });
});

describe('toDependencies', () => {
  it('excludes typescript, rxjs and zone.js — they are toolchain axes, not third-party packages', () => {
    const pkg: PackageJson = {
      dependencies: { '@angular/core': '17.0.0', rxjs: '~7.8.0', 'zone.js': '~0.14.0' },
      devDependencies: { typescript: '~5.4.0' },
    };
    expect(toDependencies(pkg).map((dep) => dep.name).sort()).toEqual(['@angular/core']);
  });
});

describe('readDeclaredToolchain — node precedence', () => {
  it('prefers .nvmrc over every other source', () => {
    const cwd = tempProject({
      '.nvmrc': '20.11.0\n',
      '.node-version': '18.0.0',
      'package.json': '{"engines":{"node":">=16"}}',
    });
    const toolchain = readDeclaredToolchain(cwd, { engines: { node: '>=16' } });
    expect(toolchain.node).toEqual({ value: '20.11.0', kind: 'version', source: 'nvmrc' });
  });

  it('falls back to .node-version when there is no .nvmrc', () => {
    const cwd = tempProject({ '.node-version': 'v18.19.1\n' });
    const toolchain = readDeclaredToolchain(cwd, {});
    expect(toolchain.node).toEqual({ value: '18.19.1', kind: 'version', source: 'node-version' });
  });

  it('falls back to package.json engines.node, tagged as a range', () => {
    const cwd = tempProject();
    const toolchain = readDeclaredToolchain(cwd, { engines: { node: '>=18.13.0' } });
    expect(toolchain.node).toEqual({ value: '>=18.13.0', kind: 'range', source: 'engines' });
  });

  it('falls back to process.version as a last resort, tagged as such', () => {
    const cwd = tempProject();
    const toolchain = readDeclaredToolchain(cwd, {});
    expect(toolchain.node).toEqual({
      value: process.version.replace(/^v/, ''),
      kind: 'version',
      source: 'process',
    });
  });

  it('skips an .nvmrc holding an nvm alias rather than a version, falling through instead of guessing', () => {
    const cwd = tempProject({ '.nvmrc': 'lts/iron\n' });
    const toolchain = readDeclaredToolchain(cwd, { engines: { node: '>=18' } });
    expect(toolchain.node).toEqual({ value: '>=18', kind: 'range', source: 'engines' });
  });
});

describe('readDeclaredToolchain — typescript/rxjs/zone.js', () => {
  it('reads declared ranges from dependencies and devDependencies', () => {
    const cwd = tempProject();
    const toolchain = readDeclaredToolchain(cwd, {
      dependencies: { rxjs: '~7.8.0', 'zone.js': '~0.14.0' },
      devDependencies: { typescript: '~5.4.0' },
    });
    expect(toolchain.typescript).toBe('~5.4.0');
    expect(toolchain.rxjs).toBe('~7.8.0');
    expect(toolchain.zoneJs).toBe('~0.14.0');
  });

  it('leaves an axis undefined rather than guessing when it is not declared at all', () => {
    const cwd = tempProject();
    const toolchain = readDeclaredToolchain(cwd, { dependencies: { rxjs: '~7.8.0' } });
    expect(toolchain.zoneJs).toBeUndefined();
    expect(toolchain.typescript).toBeUndefined();
  });
});
