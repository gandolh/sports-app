# Task 25 — Persistence v4: the migration, the store, the service

## Context

Brief 24 declared schema v4 (`ExerciseRecord.logged`, and `completedAt` now readable by
the UI). This brief makes v4 documents round-trip: local storage, the codec's migration
chain, the sync payload, and the SQLite service.

**Depends on brief 24.** Read `corpus/CLAUDE.md` invariants first.

## What you own

```
client/src/persistence/codec.ts        v3 → v4 migration + validation
client/src/persistence/store.ts        whatever the version bump touches
client/src/persistence/sync.ts         payload version handling
client/src/persistence/__tests__/**    adapt + extend
shared/api.ts                          the wire schemas
server/db.mjs                          accept schema_version 4
server/state-server.mjs                accept and validate v4
server/__tests__/**                    adapt + extend
```

**Do NOT touch** `client/src/domain/**`, `client/src/ui/**`, or `shared/types.ts`
(brief 24 owns it and has finished with it).

## The migration

`codec.ts` already carries a v1/v2 → v3 chain (brief 16). Extend it, do not rewrite it.

**v3 → v4 is additive and lossless:** bump `schemaVersion`, leave every
`ExerciseRecord` without a `logged` key. Absent is the normal case, so the migration
writes nothing — which means the *only* real work is that a v3 document must be accepted
and re-stamped rather than rejected.

Validation for `logged`, in the codec's existing style:

- Absent → fine, the common case.
- Present → an array of finite non-negative numbers, length ≤ `sets`.
- **Out-of-range is a normal case, not a crash.** The document is hand-editable at 2am
  (see the header of `shared/types.ts`). A `logged` array longer than `sets`, or holding
  a negative, degrades — truncate, clamp, or drop the field — and never throws. Follow
  whatever the file already does for `cyclePosition`; be consistent with it rather than
  inventing a second policy.

Add a round-trip test: a v3 fixture on disk decodes to a v4 document, re-encodes, and
decodes again to the same value.

## The service

`server/db.mjs` writes `schema_version` on every snapshot row and
`state-server.mjs` validates the document shape. Both must accept 4.

**Decide and state which of these the service does, then do exactly one:** accept 4 only,
or accept 3 and 4. Look at how the service already handles version 3 versus 2 and follow
that precedent rather than choosing freshly — the service and the client have to agree
about who owns migration, and that question already has an answer in this repo.

The service still must not interpret training content. `logged` crosses the wire as
opaque numbers; **no route may read it, sum it, or derive anything from it.** If you find
yourself wanting a `logged` index or aggregate in SQL, that is the service becoming a
consumer of the programme — stop and report it.

## Acceptance

- `npm run typecheck && npm run lint && npm test` green from the repo root.
- A v1, a v2 and a v3 fixture each migrate to v4 and round-trip.
- A hand-corrupted `logged` degrades without throwing, with a test per corruption shape.
- The service stores and returns a v4 document unchanged.
- `server/__tests__` still passes its existing assertions about v3 handling, or those
  assertions are updated with a one-line comment saying why.

## Out of scope

Any UI. The Tailwind migration. Reading `logged` back for display — brief 27 does that
and only needs the field to survive the round trip.
