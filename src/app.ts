import { analyze, currentAngularMajor } from './compat';
import { readDeclaredToolchain, readPackageJson, toDependencies } from './project';
import { fetchPackages as defaultFetchPackages } from './registry';
import { resolveFormat } from './output-format';
import { renderReport } from './report';
import { renderJsonReport } from './report-json';
import { renderMarkdownReport } from './report-markdown';

const ANGULAR_CORE = '@angular/core';

/**
 * Angular's own packages, always fetched regardless of what the project
 * declares: @angular/core for the latest dist-tag and its rxjs/zone.js peers,
 * @angular/compiler-cli for its typescript peer, @angular/cli for engines.node.
 */
const ANGULAR_TOOLCHAIN_PACKAGES = [ANGULAR_CORE, '@angular/compiler-cli', '@angular/cli'];

export interface AppOptions {
  cwd: string;
  unknown: boolean;
  json: boolean;
  format?: string;
}

export interface AppResult {
  /** The report, in the requested format, ready to write to stdout. */
  stdout: string;
  /** Notes for stderr under --verbose — never part of the report itself. */
  diagnostics: string[];
}

/** Lets tests run the whole pipeline without touching the network. */
export interface AppDeps {
  fetchPackages: typeof defaultFetchPackages;
}

/**
 * The whole run: read the project, fetch what the registry knows, compute the
 * ceiling, render it. Throws only NgCeilingError for anything a user caused or
 * can act on; the CLI turns that into a concise stderr message.
 */
export async function runCeiling(
  options: AppOptions,
  deps: AppDeps = { fetchPackages: defaultFetchPackages },
): Promise<AppResult> {
  const format = resolveFormat(options.format, options.json);

  const pkg = readPackageJson(options.cwd);
  const dependencies = toDependencies(pkg);

  // Fail before any network round trip if this isn't an Angular project.
  currentAngularMajor(dependencies);

  const toolchain = readDeclaredToolchain(options.cwd, pkg);
  const { packages, notFound } = await deps.fetchPackages([
    ...dependencies.map((dep) => dep.name),
    ...ANGULAR_TOOLCHAIN_PACKAGES,
  ]);

  const analysis = analyze(dependencies, packages, toolchain);
  const reportOptions = { listUnknown: options.unknown };

  const stdout =
    format === 'json'
      ? renderJsonReport(analysis)
      : format === 'markdown'
        ? renderMarkdownReport(analysis, reportOptions)
        : renderReport(analysis, reportOptions);

  const diagnostics = [`fetched ${Object.keys(packages).length} packuments from the registry`];
  if (notFound.length > 0) {
    diagnostics.push(`not found in the registry, treated as unverified: ${notFound.join(', ')}`);
  }

  return { stdout, diagnostics };
}
