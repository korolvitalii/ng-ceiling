export const FORMATS = ['console', 'json', 'markdown'] as const;
export type Format = (typeof FORMATS)[number];

/**
 * `--json` is shorthand for `--format json`. An explicit `--format` always
 * wins, including `--format console`, so `format` must be `undefined` (not
 * `'console'`) when the flag was not passed — the CLI drops commander's
 * default to keep that distinction.
 */
export function resolveFormat(format: string | undefined, json: boolean): Format {
  if (format !== undefined) {
    if (!FORMATS.includes(format as Format)) {
      throw new Error(`unknown --format "${format}" (expected one of: ${FORMATS.join(', ')})`);
    }
    return format as Format;
  }
  return json ? 'json' : 'console';
}
