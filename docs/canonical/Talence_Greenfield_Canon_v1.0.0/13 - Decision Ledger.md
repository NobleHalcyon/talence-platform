# 13 — Decision Ledger

Version: 1.0.0  
Status: Locked record

## A. Locked decisions

### Product and scope

- Greenfield rebuild; existing code is not preserved.
- Initial product is invite-only private beta.
- Product is useful without robot hardware.
- First game is MTG.
- Mobile-friendly collection tracking and deck building are core.
- Third-party machines post collection updates through a stable API.
- Cloud and robot are separate projects/systems and separate repositories/deployments.

### Web stack

- Next.js App Router + React + TypeScript.
- Vercel hosting.
- CSS Modules and shared token/class CSS.
- No Tailwind or utility-class-wall styling.
- Supabase SSR session integration.
- Route Handlers implement initial external API.

### Backend/data

- Supabase PostgreSQL, Auth, and Storage.
- RLS on exposed tables.
- PostgreSQL functions own atomic inventory/admission behavior.
- No custom human password/session implementation.
- No MongoDB cloud architecture.

### Admission and tenancy

- Public signup disabled.
- Production sign-in and password recovery use CAPTCHA/bot protection plus provider/WAF rate limits.
- `app_private.invited_users` is in the auth creation chain.
- Supabase Before User Created hook rejects uninvited emails.
- Acceptance finalization creates profile, personal workspace, owner membership, and default collection atomically.
- Workspace is the ownership root.
- Fixed roles: owner/admin/editor/viewer.
- Global admission invite and workspace membership invite are separate concepts.

### Catalog and pricing

- Scryfall initial provider.
- Bulk-worker ingestion, not browser/live per-card lookup.
- `all_cards` source for complete language-specific catalog.
- Current price keyed by printing/provider/currency/finish.
- Price source and observation time shown.
- Missing price is unknown.
- Scryfall estimate not storefront/accounting truth.
- Python 3.13 catalog worker.
- PostgreSQL search initially; no paid search provider.

### Inventory and decks

- Inventory balance key: collection + printing + finish + condition.
- Immutable transaction ledger plus materialized balances.
- All mutations atomic and auditable.
- Deck entries reference oracle cards with optional preferred printing.
- Deck ownership aggregates across selected collection sources.

### Devices and robot

- Machine credentials distinct from human auth.
- Raw credential shown once and not stored.
- Explicit collection grants.
- Idempotency required for machine mutations.
- Robot downloads immutable SQLite catalog snapshots.
- Robot works offline.
- No remote motion start.
- Cloud stores thin run summaries only.

### Cost/security

- Anonymous dynamic app data denied.
- Metered services server-only through quotas/circuit breakers.
- Images not proxied/transformed by paid infrastructure by default.
- Vercel WAF/Spend Management and Supabase Spend Cap/configuration are production gates.

## B. Deferred decisions/features

- Public catalog and public/unlisted collection/deck pages.
- Workspace membership UI beyond foundation.
- Social login and MFA beyond provider-ready architecture.
- Native mobile app.
- Mobile camera scanning.
- Multiple pricing providers and price history.
- Store locations, cost basis, acquisition lots, sales, margin, tax.
- Marketplace, trading, storefront, event advertising.
- Subscription billing and hardware entitlements.
- AI/EDHREC-style recommendations.
- Other TCGs and non-TCG inventory.
- Cloud robot monitoring/configuration/fleet management.
- Dedicated FastAPI service; may replace Route Handlers behind same contract later.
- Durable hosted job platform beyond initial GitHub Actions worker.

## C. Prohibited without canonical revision

- Public self-registration.
- Custom storage of human passwords or refresh tokens.
- Device using a human auth session.
- Direct browser calls to paid/metered external providers.
- Direct client updates to balances or immutable history.
- Catalog mutation by ordinary users/devices.
- Tailwind as styling architecture.
- Cloud motion commands.
- Cloud storage of robot execution checkpoints as authority.
- Silent ambiguous CSV/card matching.
- Treating missing price as zero.
- Claiming Scryfall estimates are storefront-grade.
- Scraping EDHREC or relying on unofficial private endpoints.

## D. Open but non-blocking

- Production domain names.
- Exact Supabase and Vercel regions; choose co-located regions.
- Custom SMTP provider and email branding.
- Final Talence logo asset and favicon package.
- Exact daily catalog-sync time.
- Private-beta invitation expiry default (recommended 7 days).
- Hard-purge retention periods after private-beta observation.
- Commercial licensing path and future store-grade pricing provider.

Codex must expose these as configuration or documentation, not invent business commitments.
