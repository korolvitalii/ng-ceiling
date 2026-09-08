# Angular Upgrade Ceiling

| Metric | Value |
| --- | --- |
| Current Angular | 16 |
| Declared ceiling | **18** (upper bound) |
| Latest Angular | 20 |
| First blocked version | Angular 19 |

## Blockers

### ngx-old-calendar

- Installed: `7.2.0`
- Declared support: Angular 15-18
- Compatible with Angular 19: **none**
- If replaced: ceiling 18 → 20

## Upgrades required for Angular 18

| Package | Installed | Bump to |
| --- | --- | --- |
| @ngrx/store | `16.3.0` | v18 (`18.1.1`) |
| primeng | `16.9.1` | v18 (`18.0.2`) |

The ceiling assumes these are upgraded — no version in their declared range supports Angular 18. They do not lower the ceiling.

## Unverified

3 dependencies declare no Angular constraint. They are excluded from the ceiling above.

Run with `--unknown` to list them.

---

Declared compatibility ≠ resolvable ≠ verified. The ceiling is an optimistic upper bound: transitive dependencies are not analysed, and dependencies without a declared constraint are excluded from it.
