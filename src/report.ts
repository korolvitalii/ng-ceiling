import type { CeilingAnalysis } from './types';

const RULE = '─'.repeat(33);
const COLUMN = 25;

/**
 * The "If replaced" block sits one column further right than every other row.
 * That is how the report is written in the specification, and the golden file
 * is compared byte for byte, so the difference is reproduced rather than
 * quietly normalised.
 */
const UNLOCK_COLUMN = 26;

function row(label: string, value: string, width: number = COLUMN): string {
  return `${label.padEnd(width)}${value}`;
}

export interface ReportOptions {
  /** Print the UNKNOWN dependencies by name instead of only their count. */
  listUnknown?: boolean;
}

/** Renders the console report. Pure: same analysis in, same bytes out. */
export function renderReport(analysis: CeilingAnalysis, options: ReportOptions = {}): string {
  const lines: string[] = ['Angular Upgrade Ceiling', RULE, ''];

  lines.push(row('Current Angular', String(analysis.currentAngularMajor)));
  lines.push(row('Declared ceiling', `${analysis.declaredCeiling}  (upper bound)`));
  lines.push(row('Latest Angular', String(analysis.latestAngularMajor)));

  if (analysis.firstBlockedMajor !== undefined) {
    lines.push('', row('First blocked version', `Angular ${analysis.firstBlockedMajor}`));
  }

  if (analysis.blockers.length > 0) {
    lines.push('', 'Blockers', RULE);

    for (const blocker of analysis.blockers) {
      lines.push('', blocker.packageName, '');
      lines.push(row('Installed', blocker.installedVersion));
      lines.push(row('Declared support', blocker.declaredSupport));
      lines.push(row(`Compatible Angular ${blocker.targetAngularMajor}`, 'NONE'));

      if (blocker.ceilingWithoutBlocker !== undefined) {
        lines.push('', 'If replaced:');
        lines.push(
          row(
            'Ceiling',
            `${analysis.declaredCeiling} → ${blocker.ceilingWithoutBlocker}`,
            UNLOCK_COLUMN,
          ),
        );
      }
    }
  }

  const unknown = analysis.unknownDependencies;
  if (unknown.length > 0) {
    lines.push('', 'Unverified', RULE, '');
    lines.push(
      unknown.length === 1
        ? '1 dependency declares no Angular constraint.'
        : `${unknown.length} dependencies declare no Angular constraint.`,
    );
    lines.push('They are excluded from the ceiling above.');

    if (options.listUnknown === true) {
      lines.push('', ...unknown.map((name) => `  ${name}`));
    } else {
      lines.push('Run with --unknown to list them.');
    }
  }

  return `${lines.join('\n')}\n`;
}
