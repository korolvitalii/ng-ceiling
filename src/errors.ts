/**
 * An error whose message is already fit to show a user. Everything ng-ceiling
 * throws on purpose — bad input, an unreachable registry, a project that isn't
 * Angular — is one of these. Anything else reaching the top level is a bug and
 * is reported as such.
 *
 * `hint` is an optional second line telling the user what to do about it.
 */
export class NgCeilingError extends Error {
  readonly hint?: string;

  constructor(message: string, options: { hint?: string; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'NgCeilingError';
    this.hint = options.hint;
  }
}

/** The npm registry could not be reached, returned an error status, or timed out. */
export class RegistryUnavailableError extends NgCeilingError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      cause,
      hint: 'check your network connection, or set npm_config_registry if you use a proxy',
    });
    this.name = 'RegistryUnavailableError';
  }
}

/**
 * The stderr text for an error. A deliberate NgCeilingError prints concisely —
 * one `ng-ceiling:` line, its hint, and its cause chain only under `--verbose`.
 * Anything else is unexpected: it says so, and hides the stack unless asked.
 */
export function formatError(error: unknown, verbose: boolean): string {
  if (error instanceof NgCeilingError) {
    const lines = [`ng-ceiling: ${error.message}`];
    if (error.hint !== undefined) lines.push(`  ${error.hint}`);
    if (verbose) lines.push(...causeChain(error));
    return `${lines.join('\n')}\n`;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lines = [`ng-ceiling: unexpected error: ${message}`];
  if (verbose && error instanceof Error && error.stack !== undefined) {
    lines.push(error.stack);
  } else {
    lines.push('  re-run with --verbose for details');
  }
  return `${lines.join('\n')}\n`;
}

function causeChain(error: Error): string[] {
  const lines: string[] = [];
  let cause: unknown = error.cause;
  while (cause !== undefined) {
    const message = cause instanceof Error ? cause.message : String(cause);
    lines.push(`  caused by: ${message}`);
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines;
}
