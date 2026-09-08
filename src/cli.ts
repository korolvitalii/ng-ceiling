import { Command } from 'commander';
import { analyze } from './compat';
import { readDeclaredToolchain, readPackageJson, toDependencies } from './project';
import { fetchPackages, RegistryUnavailableError } from './registry';
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

const FORMATS = ['console', 'json', 'markdown'] as const;
type Format = (typeof FORMATS)[number];

interface Options {
  cwd: string;
  unknown: boolean;
  format: string;
  json: boolean;
}

/** `--json` is shorthand for `--format json`; an explicit `--format` wins if both are given. */
function resolveFormat(options: Options): Format {
  const chosen = options.format !== 'console' ? options.format : options.json ? 'json' : 'console';
  if (!FORMATS.includes(chosen as Format)) {
    throw new Error(`unknown --format "${chosen}" (expected one of: ${FORMATS.join(', ')})`);
  }
  return chosen as Format;
}

async function run(options: Options): Promise<void> {
  const format = resolveFormat(options);

  const pkg = readPackageJson(options.cwd);
  const dependencies = toDependencies(pkg);

  if (!dependencies.some((dep) => dep.name === ANGULAR_CORE)) {
    throw new Error(`not an Angular project: no ${ANGULAR_CORE} dependency in ${options.cwd}`);
  }

  const toolchain = readDeclaredToolchain(options.cwd, pkg);
  const packages = await fetchPackages([
    ...dependencies.map((dep) => dep.name),
    ...ANGULAR_TOOLCHAIN_PACKAGES,
  ]);

  const analysis = analyze(dependencies, packages, toolchain);
  const reportOptions = { listUnknown: options.unknown };

  const output =
    format === 'json'
      ? renderJsonReport(analysis)
      : format === 'markdown'
        ? renderMarkdownReport(analysis, reportOptions)
        : renderReport(analysis, reportOptions);

  process.stdout.write(output);
}

const program = new Command()
  .name('ng-ceiling')
  .description(
    "Reports the highest Angular major version your project can reach, and what's blocking it.",
  )
  .option('--cwd <path>', 'project directory to analyse', process.cwd())
  .option('--format <format>', 'output format: console, json or markdown', 'console')
  .option('--json', 'shorthand for --format json', false)
  .option('--unknown', 'list the dependencies that declare no Angular constraint', false)
  .action(async (options: Options) => {
    try {
      await run(options);
    } catch (error) {
      const detail =
        error instanceof RegistryUnavailableError || error instanceof Error
          ? error.message
          : String(error);
      process.stderr.write(`ng-ceiling: ${detail}\n`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
