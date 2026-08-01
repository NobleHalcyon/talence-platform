# Talence Greenfield Canon Changelog

## 1.0.4 - 2026-08-01

- Replaced the one-level catalog drawer contract with shared progressive quick, advanced, and two-level logic filtering for catalog and collection inventory.
- Added a URL-serialized, server-validated AND/OR/NOT filter tree and required printing-level filtering before Oracle representative selection.
- Normalized types, numeric P/T/L projections, multi-artist identity, legalities, and data-derived bounded facets.
- Established searchable human-readable set/language selectors, accessible mana/set symbols, numeric range behavior, and removal of price-availability/currency filters.

## 1.0.3 — 2026-08-01

- Made Grid the catalog default for every bare-route visit while retaining Table as an explicit URL-addressable view.
- Replaced grid information panels with image detail links and hover/focus Oracle names, compact foil/nonfoil prices, and collection/deck quick actions, with touch-accessible equivalents.
- Removed catalog ingestion metadata and the redundant Oracle-mode explanation from browse results.
- Added admitted-user-scoped short-term result caching and session scroll restoration for reliable browser-Back continuity.
- Defined Oracle price floors across eligible printings, including set-constrained floors and exact-printing prices in all-variants mode.

## 1.0.2 — 2026-07-31

- Made catalog browse open directly on populated grid results, with the result-view controls ordered Grid then Table.
- Consolidated all catalog filters into one drawer launched beside Search at every viewport width.
- Aligned the one-to-five-column grid with bounded 6/12/18/24/30-result page sizes so catalog pages form six complete rows when enough matches exist.
- Made Oracle-card results the default, added the opt-in **Return all variants** control, and made representative selection honor every active filter including set code.
- Enlarged the authenticated header and identity controls, reduced primary navigation to Catalog, Collections, and Decks, and moved workspace switching, Devices, authorized Admin access, Settings, and Log Out into the profile submenu.

## 1.0.1 — 2026-07-29

- Amended private-beta authentication to accept an admitted handle or email while keeping password/session authority in Supabase Auth and handle mapping on the trusted server.
- Replaced the anonymous marketing landing with the focused Talence brand/sign-in entrance and direct authenticated dashboard routing.
- Established the supplied gold emblem as the canonical web brand asset and documented the narrow entrance-only color, geometry, gradient, and typography exceptions.
- Carried the canonical emblem and celestial linework into the authenticated shell with a deep-navy header and one continuously aligned gold-to-dark-gray ornament field.
- Removed the persistent active-workspace rail, consolidated Settings fields into one aligned responsive grid, and standardized single-line text/select control heights.

## 1.0.0 — 2026-07-26

Initial greenfield authority package.

- Replaced all legacy implementation authority with a clean-sheet product and architecture canon.
- Selected Next.js/Vercel, Supabase Auth/Postgres/Storage/RLS, and a separate Python catalog worker.
- Established invite-only admission through a private invited-user ledger and Supabase Before User Created hook.
- Established workspace-rooted ownership, fixed initial roles, and separate device credentials.
- Defined Scryfall catalog/pricing ingestion and immutable robot SQLite snapshots.
- Defined auditable collection inventory, first-class decks, device API contracts, mobile UX, security/cost controls, and phased private-beta delivery.
