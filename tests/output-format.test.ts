import { describe, expect, it } from 'vitest';
import { resolveFormat } from '../src/output-format';

describe('resolveFormat', () => {
  it('defaults to console when neither flag is given', () => {
    expect(resolveFormat(undefined, false)).toBe('console');
  });

  it('treats --json as shorthand for --format json', () => {
    expect(resolveFormat(undefined, true)).toBe('json');
  });

  it.each(['console', 'json', 'markdown'] as const)('accepts --format %s', (format) => {
    expect(resolveFormat(format, false)).toBe(format);
  });

  it('lets an explicit --format win over --json', () => {
    expect(resolveFormat('markdown', true)).toBe('markdown');
  });

  it('lets an explicit --format console override --json', () => {
    expect(resolveFormat('console', true)).toBe('console');
  });

  it('rejects an unknown format, naming the valid ones', () => {
    expect(() => resolveFormat('yaml', false)).toThrow(
      'unknown --format "yaml" (expected one of: console, json, markdown)',
    );
  });
});
