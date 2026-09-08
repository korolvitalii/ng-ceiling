# Angular Upgrade Ceiling

| Metric | Value |
| --- | --- |
| Current Angular | 17 |
| Declared ceiling | **20** (upper bound) |
| Latest Angular | 20 |

## Upgrades required for Angular 20

| Package | Installed | Bump to |
| --- | --- | --- |
| @ngrx/store | `17.2.0` | v20 (`20.0.1`) |
| primeng | `17.18.15` | v20 (`20.0.2`) |

The ceiling assumes these are upgraded — no version in their declared range supports Angular 20. They do not lower the ceiling.

---

Declared compatibility ≠ resolvable ≠ verified. The ceiling is an optimistic upper bound: transitive dependencies are not analysed, and dependencies without a declared constraint are excluded from it.
