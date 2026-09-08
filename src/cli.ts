import { Command } from 'commander';
import { runCeiling, type AppOptions } from './app';
import { formatError } from './errors';

interface Options extends AppOptions {
  verbose: boolean;
}

const program = new Command()
  .name('ng-ceiling')
  .description(
    "Reports the highest Angular major version your project can reach, and what's blocking it.",
  )
  .option('--cwd <path>', 'project directory to analyse', process.cwd())
  .option('--format <format>', 'output format: console, json or markdown')
  .option('--json', 'shorthand for --format json', false)
  .option('--unknown', 'list the dependencies that declare no Angular constraint', false)
  .option('--verbose', 'print registry diagnostics, and full detail on errors', false)
  .action(async (options: Options) => {
    try {
      const { stdout, diagnostics } = await runCeiling(options);
      if (options.verbose) {
        for (const line of diagnostics) process.stderr.write(`ng-ceiling: ${line}\n`);
      }
      process.stdout.write(stdout);
    } catch (error) {
      process.stderr.write(formatError(error, options.verbose));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
