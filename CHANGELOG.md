# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-09

First tagged release. `ng-ceiling` reports the highest Angular major a project
can declare its way to, and what stops it going further — from `package.json`
and published peer metadata alone, with no install and no build.

### Added

- **Declared Angular ceiling.** Reads direct dependencies (including
  `devDependencies`), fetches abbreviated packuments, and walks up from the
  project's current Angular major to the first one some dependency has no
  compatible published version for. The result is an *optimistic upper bound*
  and the output says so — declared compatibility is not resolvable or verified
  compatibility, and transitive dependencies are not analysed.
- **Blocker analysis.** Names each dependency that caps the ceiling: the Angular
  major it stops at, the span of majors its published history actually declares
  support for (gaps shown, e.g. `Angular 5-12, 14-22`), and the ceiling the
  project would reach if that one blocker were removed.
- **Angular toolchain constraints.** Detects Angular's own peers on TypeScript
  (via `@angular/compiler-cli`), RxJS and zone.js (via `@angular/core`), and
  Node (via `@angular/cli` `engines.node`), and runs them as a second ceiling
  walk combined by taking the lower blocked major. Node version is read from
  `.nvmrc`, then `.node-version`, then `engines.node`, then `process.version`
  (the fallback is flagged in the output).
- **Required upgrades.** Lists known dependencies whose *declared range* holds
  no version supporting the ceiling major even though a higher release does —
  the bumps the optimistic ceiling silently assumes — each with the exact floor
  version to move to. `@angular/*` packages are excluded (they move with the
  framework major); the section appears only when the ceiling is above the
  project's current major.
- **Unverified dependencies.** Dependencies that declare no measurable Angular
  peer are excluded from the number and reported separately, never counted
  against the ceiling. `--unknown` lists them by name.
- **Output formats.** `--format console` (default), `--format json` and
  `--format markdown`; `--json` is shorthand for `--format json`. The JSON
  payload has stable field names for use in CI.
- **`--verbose`.** Prints registry fetch diagnostics to stderr, and the full
  `caused by:` chain on errors.
- **`--version` / `-V`.** Prints the installed version.
- **Error handling.** Every deliberate failure is a single-line message with an
  optional hint — not an Angular project, unreadable version range, missing
  `package.json`, registry unreachable / timed out (15s per request) /
  returning a bad status or malformed body.

### Notes

- The latest Angular major is always read from the `@angular/core` `latest`
  dist-tag, never hardcoded.
- Runtime dependencies: `commander`, `semver`.
- Validated by hand against real Angular applications spanning Angular 7-22,
  including projects using NgRx, Angular Material, PrimeNG and Ionic.

## [0.0.1]

Unlisted. A name-claim publish to npm — a working but undocumented snapshot,
superseded by 0.1.0.

[0.1.0]: https://github.com/korolvitalii/ng-ceiling/releases/tag/v0.1.0
