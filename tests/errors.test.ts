import { describe, expect, it } from 'vitest';
import { formatError, NgCeilingError, RegistryUnavailableError } from '../src/errors';

describe('formatError — deliberate errors', () => {
  it('prints one concise line for a bare NgCeilingError', () => {
    expect(formatError(new NgCeilingError('not an Angular project'), false)).toBe(
      'ng-ceiling: not an Angular project\n',
    );
  });

  it('prints the hint on its own indented line', () => {
    const out = formatError(
      new NgCeilingError('no package.json found in /tmp/x', { hint: 'pass --cwd <path>' }),
      false,
    );
    expect(out).toBe('ng-ceiling: no package.json found in /tmp/x\n  pass --cwd <path>\n');
  });

  it('hides the cause chain unless verbose', () => {
    const err = new NgCeilingError('bad JSON', { cause: new Error('Unexpected token }') });
    expect(formatError(err, false)).not.toContain('caused by');
    expect(formatError(err, true)).toContain('  caused by: Unexpected token }');
  });

  it('walks a nested cause chain under verbose', () => {
    const root = new Error('ECONNREFUSED');
    const mid = new RegistryUnavailableError('could not reach the npm registry', root);
    expect(formatError(mid, true)).toContain('caused by: ECONNREFUSED');
  });
});

describe('formatError — unexpected errors', () => {
  it('labels an unexpected error and points at --verbose', () => {
    const out = formatError(new TypeError('x is not a function'), false);
    expect(out).toContain('ng-ceiling: unexpected error: x is not a function');
    expect(out).toContain('re-run with --verbose for details');
  });

  it('prints the stack under verbose instead of the pointer', () => {
    const out = formatError(new TypeError('boom'), true);
    expect(out).toContain('TypeError: boom');
    expect(out).not.toContain('re-run with --verbose');
  });

  it('stringifies a non-Error throw', () => {
    expect(formatError('a string', false)).toContain('ng-ceiling: unexpected error: a string');
  });
});
