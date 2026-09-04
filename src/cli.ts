import { Command } from 'commander';
import { analyze } from './compat';
import { readPackageJson, toDependencies } from './project';
import { fetchPackages, RegistryUnavailableError } from './registry';
import { renderReport } from './report';

const ANGULAR_CORE = '@angular/core';

interface Options {
  cwd: string;
  unknown: boolean;
}

async function run(options: Options): Promise<void> {
  const dependencies = toDependencies(readPackageJson(options.cwd));

  if (!dependencies.some((dep) => dep.name === ANGULAR_CORE)) {
    throw new Error(`not an Angular project: no ${ANGULAR_CORE} dependency in ${options.cwd}`);
  }

  const packages = await fetchPackages([...dependencies.map((dep) => dep.name), ANGULAR_CORE]);
  process.stdout.write(
    renderReport(analyze(dependencies, packages), { listUnknown: options.unknown }),
  );
}

const program = new Command()
  .name('ng-ceiling')
  .description(
    "Reports the highest Angular major version your project can reach, and what's blocking it.",
  )
  .option('--cwd <path>', 'project directory to analyse', process.cwd())
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
