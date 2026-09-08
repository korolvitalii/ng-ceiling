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
- Declared support: Angular <=18
- Compatible with Angular 19: **none**
- If replaced: ceiling 18 → 20

## Unverified

3 dependencies declare no Angular constraint. They are excluded from the ceiling above.

- date-fns
- lodash-es
- uuid

---

Declared compatibility ≠ resolvable ≠ verified. The ceiling is an optimistic upper bound: transitive dependencies are not analysed, and dependencies without a declared constraint are excluded from it.
