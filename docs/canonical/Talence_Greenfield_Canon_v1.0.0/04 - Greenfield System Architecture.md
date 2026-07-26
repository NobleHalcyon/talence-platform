# 04 — Greenfield System Architecture

Version: 1.0.0  
Status: Locked

## 1. Selected stack

### Web application

- Next.js App Router, current stable release at implementation time
- React and TypeScript
- Vercel deployment and preview environments
- CSS Modules plus shared token/global class files
- Supabase SSR client integration
- Server Components for initial reads where appropriate
- Server Actions for authenticated human mutations
- Versioned Route Handlers for machine/external API endpoints

### Data and identity

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage for private imports and immutable catalog artifacts
- PostgreSQL Row Level Security
- PostgreSQL functions for atomic multi-row invariants

### Catalog pipeline

- Python 3.13 worker/CLI
- `pyproject.toml` with locked dependencies
- streaming JSON parsing
- direct PostgreSQL connection or trusted Supabase service client
- GitHub Actions as the initial scheduler/executor

### Robot

- Separate repository and deployable system
- the platform repository must never delete, rewrite, or absorb active robot implementation work
- local SQLite runtime database
- read-only/versioned catalog SQLite snapshot
- offline outbox for cloud updates
- device credential and versioned API client

## 2. Architecture diagram

```text
Anonymous browser
  └─ static landing / login / invite callback only

Admitted browser
  └─ Next.js on Vercel
       ├─ Server Components and Server Actions
       ├─ Supabase Auth session cookies
       ├─ RLS-bound Supabase server client
       └─ /api/v1 device and integration routes

Supabase
  ├─ Auth: human identity and sessions
  ├─ Postgres: admission, workspaces, catalog, inventory, decks, devices
  ├─ RLS: tenant/resource isolation
  ├─ Functions: atomic inventory, admission, ownership calculations
  └─ Storage: private imports and immutable robot catalog artifacts

Catalog worker
  ├─ Scryfall bulk and set metadata
  ├─ staging + validation + promotion
  ├─ current price observations
  └─ SQLite snapshot generation

Robot / approved machine
  ├─ local identification and execution
  ├─ snapshot download and atomic swap
  ├─ offline queue
  └─ idempotent inventory and run-summary uploads
```

## 3. Why this architecture

### Next.js instead of a standalone SPA

The App Router supplies layouts, server rendering, server-side session handling, and co-located route handlers without requiring a separate browser API for every feature. Vercel is the intended host, so this is the lowest-friction greenfield path.

### No custom always-on cloud API in the first build

The stable external contract is more important than the first implementation language. Route Handlers implement `/api/v1` while PostgreSQL functions own transactional behavior. A future FastAPI service can replace those handlers without changing device payloads or database invariants.

### PostgreSQL instead of MongoDB

Talence has strong relational identities and invariants: workspaces, memberships, printing-based balances, immutable transaction lines, decks, device grants, and idempotency. PostgreSQL constraints, transactions, indexes, and RLS are a natural fit.

### Separate Python catalog worker

Large Scryfall files should not be downloaded or transformed in a user request. A deployment-neutral worker can run in CI initially and move to a durable job host later without changing the web app.

### Robot separation

Hardware execution has different reliability, safety, offline, and deployment requirements. Sharing a database or lifecycle with the web app would couple unrelated failure modes.

## 4. Repository layout

The new platform repository should be:

```text
/
├─ apps/
│  └─ web/
│     ├─ app/
│     ├─ components/
│     ├─ features/
│     ├─ lib/
│     ├─ styles/
│     ├─ tests/
│     └─ package.json
├─ packages/
│  ├─ domain/                 # shared TypeScript domain types and validators
│  ├─ ui/                     # reusable Talence primitives
│  └─ contracts/              # OpenAPI/JSON Schema and generated clients
├─ services/
│  └─ catalog-worker/
│     ├─ src/
│     ├─ tests/
│     ├─ fixtures/
│     └─ pyproject.toml
├─ supabase/
│  ├─ migrations/
│  ├─ tests/
│  ├─ seed.sql
│  └─ config.toml
├─ docs/
│  ├─ canonical/
│  └─ dev-logs/
├─ scripts/
│  ├─ invite-user.ts
│  ├─ revoke-invite.ts
│  └─ bootstrap-admin.ts
├─ .github/workflows/
│  ├─ ci.yml
│  ├─ preview.yml
│  └─ catalog-sync.yml
├─ AGENTS.md
├─ package.json               # npm workspaces and orchestration scripts
├─ package-lock.json
└─ README.md
```

Do not add Turborepo, Nx, or another orchestration layer until build performance proves it necessary.

## 5. Application boundaries

### Browser-safe code

May contain:

- Supabase project URL;
- publishable key;
- public static configuration;
- user session access through approved helpers.

May not contain:

- Supabase secret/service key;
- direct database password;
- device credential digest logic requiring a server secret;
- catalog worker secrets;
- third-party provider secrets.

### Trusted web server code

Owns:

- invite issuance;
- admin operations;
- device credential creation and verification;
- versioned device API routes;
- external-service adapters;
- signed artifact URLs;
- operations requiring elevated database access.

### PostgreSQL functions

Own atomic operations such as:

- finalizing admission;
- applying inventory transactions;
- transferring inventory;
- reversing a transaction;
- calculating deck ownership;
- validating idempotent device batches.

Security-definer functions must use a fixed search path, minimal grants, and explicit authorization.

### Catalog worker

Owns:

- provider downloads;
- file integrity;
- staging and normalization;
- catalog promotion;
- price observation replacement;
- search-vector refresh;
- snapshot generation and upload.

## 6. Data-access standard

- Server Components perform initial reads with the authenticated user's RLS-bound Supabase client.
- Client Components are used only for interactive behavior that requires browser state.
- Human mutations use Server Actions or same-origin route handlers and user-bound authorization.
- Client code does not use a privileged Supabase client.
- Device routes use explicit credential authorization and call narrowly scoped database functions.
- Direct table access is avoided when a multi-row invariant is involved.

## 7. State management

- URL search parameters are canonical for catalog filters, sorting, and pagination.
- Server state is fetched and invalidated through Next.js server mechanisms and a small query layer where interactive screens need it.
- Local component state handles transient UI.
- A global client-state library is not required initially.
- Do not introduce Redux, Zustand, or equivalent merely for convenience.

## 8. Styling architecture

- `styles/tokens.css` defines colors, spacing, typography, radii, and breakpoints.
- `styles/globals.css` defines reset and application shell behavior.
- Shared primitives own reusable CSS Modules.
- Feature components use co-located CSS Modules.
- Reusable semantic classes are preferred over repeated declarations.
- Inline styles are prohibited except for genuinely dynamic CSS custom properties that cannot be represented by a class.
- Tailwind and utility-class walls are prohibited.

## 9. Deployment model

### Vercel

- One project for `apps/web`.
- Preview deployment for every pull request.
- Function region selected close to the Supabase database region.
- WAF rate limits on auth-adjacent and `/api/v1` routes.
- Spend Management configured before public exposure.

### Supabase

- Separate development and production projects when practical.
- Local Supabase CLI stack for migrations and RLS tests.
- Spend Cap enabled on supported paid-plan usage items.
- No exposed table without explicit RLS review.

### Catalog worker

Initial execution:

- manual workflow dispatch;
- scheduled GitHub Action after the pipeline is proven;
- no catalog import inside a web request.

## 10. Failure behavior

- Failed catalog import leaves the previous successful catalog active.
- Failed snapshot generation leaves the previous compatible snapshot downloadable.
- Device retry does not duplicate inventory.
- Browser mutation errors return a normalized error code and actionable message.
- External metered-service failure degrades the feature without corrupting canonical data.
- The web app may be unavailable without affecting an active robot run.
