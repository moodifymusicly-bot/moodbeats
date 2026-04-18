# Architectural Decisions

One-line decisions are fine; prefer a short rationale when the choice
is non-obvious or costly to reverse.

## D1. Auth provider: Clerk-only

**Context**: We had a homegrown email/password stack *and* Clerk
wired in the frontend, used neither end-to-end.

**Decision**: Clerk owns identity. Backend verifies session JWTs via
Clerk's JWKS; `users` rows are upserted on first authenticated request
keyed on the Clerk `sub` claim.

**Consequence**: Passwords no longer stored. No forgot-password flow to
maintain. Migration plan for existing accounts: `hashed_password` stays
nullable so legacy rows survive; the `clerk_id` upsert creates fresh
rows on first sign-in.

## D2. Catalog: hybrid seed + YouTube

**Context**: Seeded catalog is 200 songs; users browse via YouTube, so
recommendations never covered what they actually played.

**Decision**: Keep the 200 seed rows as the base pool. On
play/like of a YouTube result, upsert a `songs` row
(`external_source='youtube'`, `external_id=videoId`) with audio features
*inferred* from the mood tag.

**Consequence**: Recommendations cover anything the user has touched.
The inference ranges match the seed generator so taste-vector math stays
consistent.

## D3. Persistence: Postgres authoritative, localStorage cache-only

**Context**: Likes, playlists, and mood history lived only in
`localStorage`. Switching browsers wiped the "account."

**Decision**: Postgres owns all of the above. `localStorage` remains for
snappy UX but is treated as a write-through cache; on sign-in the
frontend re-fetches from the server.

**Consequence**: Library survives device swaps. Additional schema,
additional Redis invalidation on writes.

## D4. Caching: Redis on the hot paths, in-process for JWKS

**Context**: Repeated mood recs, for-you recs, and YouTube searches
were recomputed on every request; JWKS hits would have doubled auth
latency if fetched remotely each time.

**Decision**: Redis holds recommendations, taste vectors, popularity
counters, rate-limit buckets, and YouTube search results. Clerk JWKS
stays in an in-process `TTLCache` (single replica today; moving to
multi-replica would push JWKS into Redis).

**Consequence**: Auth latency ~1ms dominated by signature check. Rec
TTLs tuned (`mood=10m`, `for-you=5m`, `taste=1h`) to balance freshness
vs. load. All Redis calls fail open - an outage degrades the API but
does not 503 it.

## D5. Rate limiting: fixed per-minute buckets

**Context**: Public YouTube search and the interact endpoint are cheap
to abuse.

**Decision**: `INCR mb:rl:{actor}:{route}:{minute}` with `EXPIRE 60`.
Actor = last 24 chars of the bearer token (if any) or remote IP.

**Consequence**: No Lua, one Redis round-trip per request. A little
less precise than a sliding window but bounded memory and trivial to
reason about. Can be swapped for a token-bucket later without changing
the route map.

## D6. Deployment: single docker-compose host

**Context**: Original plan targeted Vercel + Render free tiers. The
project is now owner-hosted.

**Decision**: One compose file boots the entire stack. Laptop and VPS
use the same `docker-compose.yml`; only `.env` differs. A
`scripts/debian-vps-bootstrap.sh` wraps the provisioning.

**Consequence**: One deploy story. Zero vendor lock-in. Cold-start
penalty of free-tier services is gone. Horizontal scaling requires
moving state-like JWKS cache into Redis first (tracked as future work).

## D7. Migrations: Alembic owns schema, `create_all` is the fallback

**Context**: We were doing `Base.metadata.create_all` at startup.
Columns added without a migration never landed on running DBs.

**Decision**: Alembic migrations live under `backend/alembic/versions/`.
The lifespan runs `alembic upgrade head` when
`RUN_MIGRATIONS_ON_STARTUP=true`. `create_all` is only used as a dev
fallback when Alembic fails.

**Consequence**: Schema changes are reviewable and reversible. Requires
operator discipline: every model change must ship with a revision.

## D8. Rate-limit, cache, counters all degrade open (not closed)

**Context**: Redis is an optional dependency; treating it as load-bearing
would make every outage a full app outage.

**Decision**: If Redis returns an error we log once and fall through:
cache reads return `None`, writes no-op, rate limiter accepts the
request. Correctness rides on Postgres; Redis is an accelerator.

**Consequence**: An outage is observable in logs and in the `cached`
flag on responses but does not take the product down.
