# Code review checklist

Used for every pull request ([10 §5](spec/10-repository-structure.md)). Linked from the PR template.

1. Matches the spec section it claims; spec updated if behaviour changed.
2. Domain stays pure; no layer violation.
3. Inputs validated with contracts; permissions checked; audit entry for admin writes.
4. No dead code, no duplicate helper (searched for an existing one; reused helpers named in the PR).
5. Tests: new behaviour covered, including a failing-before test for bug fixes.
6. File headers and comments current; docs, BACKLOG.md and OPEN.md updated in the same PR.
7. No secrets, no `console.log`, no TODO without a BACKLOG entry.
8. Migrations reviewed; backwards compatible with the previous release for rollback.
