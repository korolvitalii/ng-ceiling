# Angular Upgrade Ceiling

| Metric | Value |
| --- | --- |
| Current Angular | 17 |
| Declared ceiling | **18** (upper bound) |
| Latest Angular | 20 |
| First blocked version | Angular 19 |

## Toolchain

### TypeScript

- Installed: `~5.4.0`
- Angular 19 requires: `>=5.5 <5.9`
- If upgraded: ceiling 18 → 20

---

Declared compatibility ≠ resolvable ≠ verified. The ceiling is an optimistic upper bound: transitive dependencies are not analysed, and dependencies without a declared constraint are excluded from it.
