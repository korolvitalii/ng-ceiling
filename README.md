# ng-ceiling

Reports the highest Angular major version your project can reach, and what's blocking it.

```bash
npx ng-ceiling
```

## What it does

Reads your `package.json`, asks the npm registry what Angular versions each direct
dependency declares support for, and walks upwards from your current Angular major until
something stops. It then tells you which major is blocked, which packages block it, and how
much further you would get if each one were replaced.

## Why it exists

"Can we upgrade to Angular 20?" is usually answered by starting the upgrade and finding out.
The information needed to answer it first is public — it is sitting in the `peerDependencies`
of every package you depend on — but assembling it by hand across fifty dependencies and five
Angular majors is tedious enough that nobody does it.

## Installation

```bash
npx ng-ceiling            # no install
npm install -g ng-ceiling # or install it
```

Requires Node 20 or newer.

## Usage

```bash
ng-ceiling                        # analyse the current directory
ng-ceiling --cwd ../my-app        # analyse another project
ng-ceiling --unknown              # also list the dependencies that could not be measured
ng-ceiling --json                 # machine-readable output
ng-ceiling --format markdown      # a report to paste into Jira, GitHub or Confluence
ng-ceiling --verbose              # registry diagnostics, and full detail on errors
```

`--format` takes `console` (the default), `json` or `markdown`; `--json` is
shorthand for `--format json`. `--unknown` lists the unmeasured dependencies in
the console and Markdown output; the JSON output always includes them under
`unknown`.

On an error — no `package.json`, not an Angular project, an unreachable
registry — ng-ceiling prints a single line to stderr and exits `1`. Add
`--verbose` for the underlying cause and, while running, a note of which
packuments were fetched and which the registry did not have.

## Example output

Run against [akveo/ngx-admin](https://github.com/akveo/ngx-admin):

```text
Angular Upgrade Ceiling
─────────────────────────────────

Current Angular          15
Declared ceiling         15  (upper bound)
Latest Angular           22

First blocked version    Angular 16

Blockers
─────────────────────────────────

ng2-smart-table

Installed                1.6.0
Declared support         Angular 2-10
Compatible Angular 16    NONE

codelyzer

Installed                6.0.2
Declared support         Angular 2-12
Compatible Angular 16    NONE

Toolchain
─────────────────────────────────

zone.js

Installed                ~0.11.4
Angular 16 requires      ~0.13.0

Unverified
─────────────────────────────────

56 dependencies declare no Angular constraint.
They are excluded from the ceiling above.
Run with --unknown to list them.
```

The `Toolchain` section is Angular's own peers, not a third-party package: `zone.js`
here was never going to show up in a dependency scan, since `zone.js` doesn't declare
a peer *on* Angular — Angular declares a peer on it, the other way around.

## How it works

1. Read the direct dependencies from `package.json`.
2. Fetch the abbreviated packument for each one
   (`Accept: application/vnd.npm.install-v1+json`).
3. Keep the dependencies whose **newest** published version declares a non-optional
   `@angular/*` peer. Angular's own packages fall back to lockstep versioning, because
   `@angular/core` declares its `@angular/compiler` peer as optional and `@angular/compiler`
   declares no peers at all.
4. For each Angular major above the current one, ask whether every kept dependency has a
   published version whose Angular peer range overlaps that major — and, independently,
   whether the project's declared TypeScript, RxJS, zone.js and Node still overlap what
   *that* Angular major requires of them. Angular declares peers on its own toolchain the
   other way around from how third-party packages declare a peer on Angular, so this is a
   separate check reading `@angular/compiler-cli` (TypeScript), `@angular/core` (RxJS,
   zone.js) and `@angular/cli` (`engines.node`). Node itself is read in precedence order:
   `.nvmrc`, then `.node-version`, then `package.json` `engines.node`, then the running
   Node version as a last resort — flagged as such, since that describes the machine the
   tool ran on, not the project.
5. Stop at the first major where either check fails.

The latest Angular major is read from the `@angular/core` dist-tags at runtime, never
hardcoded.

## Declared compatibility

There are three different questions, and this tool answers only the first:

```text
Declared compatibility     what the package metadata claims       ← ng-ceiling
Resolvable compatibility   what a package manager can install
Verified compatibility     what actually builds and runs
```

A package that declares support for Angular 20 can still fail to build against it. A package
that declares nothing may work perfectly. The number here is derived from what maintainers
wrote down, and nothing else.

## Limitations

**The reported ceiling is an optimistic upper bound.** It can be wrong in the permissive
direction, and it is better to know exactly how:

- **Transitive dependencies are not analysed.** Only your direct dependencies are checked. A
  blocker two levels down is invisible.
- **Unmeasurable dependencies are excluded from the number,** not counted against it. They
  are reported separately under `Unverified`. Missing peer metadata is treated as unmeasured,
  never as compatible.
- **`Installed` is read from the declared range in `package.json`, not from a lockfile.** For
  a range like `^7.2.0` it shows `7.2.0`, which may not be what is installed.
- **Unlock is calculated one blocker at a time**, dependency or toolchain axis alike. When
  several things block the same major, fixing any single one changes nothing, so no unlock is
  shown even though fixing all of them would help.
- **Measurability is judged by the newest published version.** A package that declared an
  Angular peer years ago and stopped is treated as unmeasured rather than as a blocker. This
  errs towards a higher ceiling, on purpose.
- **A toolchain axis that isn't declared at all is unmeasurable, not compatible.** A zoneless
  Angular project with no `zone.js` dependency produces no zone.js check — it doesn't count as
  passing.

## Architecture

```text
CLI → project.ts ──┐
                   ├→ compat.ts ──→ report.ts
     registry.ts ──┘    │
                         └→ toolchain-compat.ts
```

`registry.ts` is the only module that touches the network and `project.ts` the only one that
touches disk. Everything that computes is a pure function over plain data, which is why the
test suite needs no mocks and never reaches the registry. `toolchain-compat.ts` mirrors
`compat.ts` for Angular's own peers on TypeScript, RxJS, zone.js and Node — kept separate
because it's a genuinely distinct question (third-party packages declare a peer *on* Angular;
Angular declares peers *on its toolchain*, the other way around) — and `compat.ts` combines
the two walks by taking the minimum blocked major.

## Development

```bash
npm install
npm run check   # lint, typecheck, test, build
npm run build
node dist/cli.js --cwd ../some-angular-app
```

## Testing

```bash
npm run test:run
```

The console report is covered by a golden test compared byte for byte against a recorded
fixture, including a recorded `@angular/core` packument, so the suite is deterministic and
runs entirely offline.

## Roadmap

- Lockfile precedence for detecting installed versions
- Maintenance signals: deprecated, stale and unmaintained packages
- pnpm and Yarn lockfiles

## Contributing

Issues and pull requests are welcome. Run `npm run check` before opening one.

## License

MIT
