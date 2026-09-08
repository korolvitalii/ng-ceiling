import type { CeilingAnalysis, ToolchainAxis } from './types';
import type { ReportOptions } from './report';

const AXIS_LABEL: Record<ToolchainAxis, string> = {
  typescript: 'TypeScript',
  rxjs: 'RxJS',
  'zone.js': 'zone.js',
  node: 'Node.js',
};

const NODE_SOURCE_LABEL: Record<string, string> = {
  nvmrc: '.nvmrc',
  'node-version': '.node-version',
  engines: 'package.json engines.node',
  process: 'process.version — no .nvmrc, .node-version or engines.node found',
};

/**
 * The Markdown report. First-class output, not an afterthought: this is the
 * format pasted into Jira, GitHub, Azure DevOps and Confluence when someone
 * is arguing for an upgrade budget.
 *
 * Pure, like the console reporter — same analysis in, same string out. The
 * upper-bound caveat appears twice on purpose (beside the number and in the
 * footer), because a Markdown report gets quoted in fragments.
 */
export function renderMarkdownReport(analysis: CeilingAnalysis, options: ReportOptions = {}): string {
  const lines: string[] = ['# Angular Upgrade Ceiling', ''];

  lines.push('| Metric | Value |', '| --- | --- |');
  lines.push(`| Current Angular | ${analysis.currentAngularMajor} |`);
  lines.push(`| Declared ceiling | **${analysis.declaredCeiling}** (upper bound) |`);
  lines.push(`| Latest Angular | ${analysis.latestAngularMajor} |`);
  if (analysis.firstBlockedMajor !== undefined) {
    lines.push(`| First blocked version | Angular ${analysis.firstBlockedMajor} |`);
  }

  if (analysis.blockers.length > 0) {
    lines.push('', '## Blockers');
    for (const blocker of analysis.blockers) {
      lines.push('', `### ${blocker.packageName}`, '');
      lines.push(`- Installed: \`${blocker.installedVersion}\``);
      lines.push(`- Declared support: ${blocker.declaredSupport}`);
      lines.push(`- Compatible with Angular ${blocker.targetAngularMajor}: **none**`);
      if (blocker.ceilingWithoutBlocker !== undefined) {
        lines.push(
          `- If replaced: ceiling ${analysis.declaredCeiling} → ${blocker.ceilingWithoutBlocker}`,
        );
      }
    }
  }

  if (analysis.toolchainBlockers.length > 0) {
    lines.push('', '## Toolchain');
    for (const blocker of analysis.toolchainBlockers) {
      const installed =
        blocker.axis === 'node' && blocker.nodeSource !== undefined
          ? `${blocker.installed} (${NODE_SOURCE_LABEL[blocker.nodeSource]})`
          : blocker.installed;
      lines.push('', `### ${AXIS_LABEL[blocker.axis]}`, '');
      lines.push(`- Installed: \`${installed}\``);
      lines.push(
        `- Angular ${blocker.targetAngularMajor} requires: \`${blocker.requiredRange}\``,
      );
      if (blocker.ceilingWithoutBlocker !== undefined) {
        lines.push(
          `- If upgraded: ceiling ${analysis.declaredCeiling} → ${blocker.ceilingWithoutBlocker}`,
        );
      }
    }
  }

  const unknown = analysis.unknownDependencies;
  if (unknown.length > 0) {
    lines.push('', '## Unverified', '');
    lines.push(
      unknown.length === 1
        ? '1 dependency declares no Angular constraint. It is excluded from the ceiling above.'
        : `${unknown.length} dependencies declare no Angular constraint. They are excluded from the ceiling above.`,
    );
    if (options.listUnknown === true) {
      lines.push('', ...unknown.map((name) => `- ${name}`));
    } else {
      lines.push('', 'Run with `--unknown` to list them.');
    }
  }

  lines.push(
    '',
    '---',
    '',
    'Declared compatibility ≠ resolvable ≠ verified. The ceiling is an optimistic ' +
      'upper bound: transitive dependencies are not analysed, and dependencies without ' +
      'a declared constraint are excluded from it.',
  );

  return `${lines.join('\n')}\n`;
}
