# Working in this repository

## Layout

| Path                     | What it is                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `src/`                   | React frontend (TanStack Start, Tailwind v4, shadcn/ui)                                               |
| `src/mocks/`             | Typed mock data - the frontend's only data source for now                                             |
| `src/services/peerly.ts` | Mock "API" layer. Replacing these bodies with `fetch` calls is the migration path to the real backend |
| `src/lib/`               | Framework-free domain logic, formatting and the evaluation draft store                                |
| `server/`                | Express + PostgreSQL API                                                                              |
| `server/migrations/`     | Versioned SQL. Immutable once applied - add a new file, never edit an applied one                     |
| `brand/`                 | SVG sources for the favicons and social image                                                         |
| `scope.md`               | Every specification requirement with its real status                                                  |

## Rules that matter here

- **Marks end up on an academic record.** Anything touching the calculation needs
  a test before it needs a commit. Use `numeric` in SQL, never a float.
- **Business rules belong in the database.** Self-evaluation, duplicate ratings,
  cross-group ratings and one-group-per-student are enforced by constraints, not
  only by the interface. Keep it that way - the API can be called directly.
- **Students must never see a rating's numeric value.** Student-facing services
  return `StudentRatingOption`, which has no `hiddenValue` field at all.
- **The audit log is append-only.** Triggers refuse `UPDATE` and `DELETE`.
- Run `npm test`, `npm run lint` and `npx tsc --noEmit` before committing.
