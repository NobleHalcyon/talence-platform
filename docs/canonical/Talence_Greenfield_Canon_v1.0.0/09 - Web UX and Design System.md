# 09 — Web UX and Design System

Version: 1.0.0  
Status: Locked

## 1. Experience goal

Talence should feel like a precise collection instrument with restrained arcane identity: structured, composed, data-capable, and slightly elevated without becoming fantasy decoration.

The UI prioritizes clarity, speed, and trustworthy state over spectacle.

## 2. Responsive standard

Mobile is a primary target, not a compressed desktop afterthought.

Reference breakpoints:

- compact: below 640px;
- medium: 640px–1023px;
- wide: 1024px and above.

Components own responsive behavior through shared media-query tokens. No page may require horizontal viewport scrolling for its primary workflow.

## 3. Route map

### Anonymous

- `/` — branded private-beta sign-in landing; an authenticated visitor redirects directly to `/app`
- `/login` — the same sign-in surface for callback and recovery statuses
- `/auth/callback`
- `/invite/complete`
- `/forgot-password`
- `/reset-password`
- legal/status pages as needed

There is no `/register` route.

### Authenticated application

- `/app`
- `/app/catalog`
- `/app/catalog/cards/[cardId]`
- `/app/catalog/printings/[printingId]`
- `/app/catalog/sets/[setCode]`
- `/app/collections`
- `/app/collections/[collectionId]`
- `/app/collections/[collectionId]/history`
- `/app/collections/[collectionId]/import`
- `/app/decks`
- `/app/decks/[deckId]`
- `/app/devices`
- `/app/devices/[deviceId]`
- `/app/settings`

### Platform administration

- `/app/admin/invites`
- `/app/admin/catalog`
- `/app/admin/operations`

Admin routes remain invisible and denied to ordinary users.

## 4. Global shell

### Wide layout

- sticky deep-navy top navigation, approximately 64px, using the canonical gold Talence emblem at a proportionally enlarged size;
- the emblem is the dashboard/home control; the visible primary links are Catalog, Collections, and Decks;
- no persistent active-workspace rail; the enlarged profile control opens a deep-navy submenu ordered as workspace selector, Devices, Admin when authorized, Settings, and Log Out with its icon;
- independently scrolling main content;
- page header with title, context, and primary action;
- main content may be constrained or full-width.

### Compact layout

- compact 64px top bar with the enlarged Talence mark and the same account submenu;
- bottom primary navigation for Catalog, Collections, and Decks;
- contextual sidebars become sheets/drawers;
- primary create/add actions remain reachable near the thumb zone;
- tables become semantic stacked rows/cards when columns cannot remain readable.

## 5. Content width modes

### Constrained

Forms, prose, settings, and focused detail sections.

- maximum width approximately 960–1200px depending on content;
- centered;
- 16px compact / 24px wide horizontal padding.
- settings fields share one responsive grid, with controls in the same horizontal row bottom-aligned independently of label or hint height.

### Full width

Catalog results, collection tables, deck editor, and analytical views.

- fills available main region;
- preserves outer padding;
- internal grids adapt responsively.

## 6. Visual identity

### Personality

- Arcane-Tech, disciplined;
- Precision Tool foundation;
- geometric and restrained;
- identity never competes with data.

### Core palette

- Navy: `#1F2F5A`
- Entry navy: `#071827`
- Gold: `#C29A3A`
- Entry gray: `#DFE5EA`
- Gray 50: `#F4F6FA`
- Gray 100: `#E9EDF5`
- Gray 200: `#D7DDEA`
- Gray 600: `#5E6A85`
- Gray 800: `#2C3448`
- White: `#FFFFFF`

Status tokens:

- success: `#2F6B4F`
- warning: `#8A641D`
- danger: `#943F46`
- information: `#356A8A`

All combinations must meet accessible contrast for their use.

### Color rules

- neutral surfaces dominate;
- navy is functional for primary actions/navigation;
- gold is rare signal/selection/identity, not a primary button fill;
- color never carries meaning alone;
- the anonymous sign-in entrance may use one restrained entry-navy-to-entry-gray transition and a subtle, complex gold geometric field;
- application surfaces use no gradients, glassmorphism, neon effects, or large gold backgrounds.

### Brand entrance

- the canonical emblem asset is the gold Talence emblem stored under the web app's local `public/brand` directory;
- the authenticated shell references that same emblem file rather than maintaining a duplicate logo asset;
- the authenticated header and page canvas reuse the same celestial SVG at one viewport-anchored size and position, rendering the continuous linework in gold over the deep-navy header and subtle dark gray over the page;
- the anonymous entrance is a focused two-row sign-in surface rather than a marketing or SaaS feature page;
- the identity row centers the emblem, Talence wordmark, and `Private Beta Underway` over entry navy;
- the form row sits on entry gray and contains username-or-email, password, sign-in, and an underlined recovery link;
- authenticated visits to the root or login surface redirect directly to the dashboard.

### Shape and depth

- consistent modest radius, recommended 6px;
- borders and spacing create structure;
- shadows only for overlays and subtle elevation;
- no bubbly cards or floating-dashboard clutter.

### Typography

- one sans-serif family, recommended Inter through `next/font` or a system fallback, for application UI;
- weights 400, 500, 600, optional 700 only for limited emphasis;
- scale: 12, 14, 16, 20, 24, 32px;
- default UI text 14px;
- numeric columns use tabular numbers;
- no decorative display fonts outside the restrained Talence wordmark and sign-in heading on the anonymous brand entrance.

### Motion

- under roughly 200ms;
- communicates state/continuity;
- reduced-motion preference honored;
- no bounce or decorative ambient animation.

## 7. Spacing and sizing

Base spacing unit: 4px.

Allowed common scale:

- 4
- 8
- 12
- 16
- 24
- 32
- 48
- 64px for major layout separation only

Standard controls:

- input/button height: 36–40px;
- touch target: at least 44px on compact layouts;
- standard table row: 40px;
- dense table row: 32px only on wide screens and by user choice.

## 8. Styling implementation

Required:

- CSS custom-property tokens;
- global reset/base classes;
- CSS Modules for component/feature styles;
- shared primitive components;
- semantic class names;
- media queries using shared breakpoint variables/conventions.

Prohibited:

- Tailwind;
- long utility-class strings;
- CSS-in-JS runtime styling for ordinary layout;
- repeated ad hoc values;
- inline style objects except genuinely dynamic CSS custom properties;
- full visual component frameworks that override Talence identity.

Headless accessibility primitives such as Radix may be used for dialogs, menus, popovers, and select behavior, but all visual styling remains Talence-owned.

## 9. Shared primitives

At minimum:

- Button
- IconButton
- TextInput
- NumberInput
- SearchInput
- Select/Combobox
- Checkbox/Radio/Switch
- FormField and validation message
- Badge/StatusBadge
- Panel/Section
- Dialog/ConfirmDialog
- Drawer/Sheet
- DropdownMenu
- Tabs
- Tooltip
- Toast/InlineAlert
- Skeleton
- EmptyState
- ErrorState
- Pagination/CursorControls
- DataTable responsive wrapper
- CardImage with face handling and fallback

Single-line text inputs and selects use the same explicit control height. Labels and supporting text remain outside that control-height measurement.
- PriceDisplay with provider/freshness
- QuantityStepper
- FilterBar/FilterDrawer

Feature code composes these primitives instead of recreating controls.

## 10. Catalog UX

### Browse

- the page opens directly on a populated result set without a redundant catalog introduction;
- search remains visible and shares one control group with Search and Filter actions;
- active filters are visible as removable chips/summary;
- all filters live in a drawer at every viewport width;
- the filter drawer exposes an unchecked **Return all variants** checkbox; its tooltip reads "Select this to return all individual printings of a card. Leave this unchecked to only return one result per card.";
- unchecked Oracle mode shows one representative per card, while checking it shows individual printings; a set filter constrains the Oracle representative to that set;
- the grid-first table/grid toggle always defaults a bare catalog route to grid; table remains an explicit URL-addressable view and does not become the later default;
- the grid uses one through five media-query-aligned columns and requests 6, 12, 18, 24, or 30 results respectively, yielding six complete rows when at least that many matches exist;
- the browse header shows the result count without ingestion metadata or a redundant Oracle-mode explanation;
- grid results remove the information panel and use the image itself as the detail link;
- hover and keyboard focus reveal the Oracle name above the image, compact Nonfoil/Foil prices below it, and folder-plus/list-plus quick actions near the image's upper-right corner; touch layouts expose the same controls without hover;
- Oracle-mode prices are the least expensive current nonfoil and foil observations across eligible printings, selected-set mode constrains those floors to that set, and all-variants mode shows exact-printing observations;
- URL query state, admitted-user-scoped short-lived result caching, and session scroll restoration make browser Back return to the recent browse instead of resetting it.

### Detail

- face-aware image viewer;
- oracle information separate from printing information;
- printing selector optimized for set, collector number, language, finish, and price;
- add-to-collection action always chooses exact printing/finish/condition/quantity;
- back navigation preserves browse filters.

## 11. Collection UX

### Structured view

Columns/fields as space allows:

- image/identity;
- name;
- set/collector;
- language;
- finish;
- condition;
- quantity;
- unit estimate;
- total estimate;
- updated time;
- selection/actions.

On mobile, each row becomes a compact inventory card with quantity controls and an overflow action menu.

### Gallery view

- responsive card grid;
- quantity and finish badges;
- total value/condition accessible without hover;
- multi-select mode.

### Analytical view

- summary cards and grouped tables/charts;
- charts are subordinate to readable values;
- no chart-only information.

### Mutation feedback

- optimistic UI only when rollback is reliable;
- committed result reconciles from server;
- stale quantity conflicts show current quantity and an explicit retry action;
- destructive changes require confirmation when more than one item or large quantities are affected.

## 12. Deck-builder UX

### Wide

Three-region layout:

1. catalog/search rail;
2. deck zones and entries;
3. ownership/validation/summary inspector.

Regions may collapse based on width.

### Compact

- tabbed or stacked Catalog / Deck / Analysis surfaces;
- persistent deck quantity and validation summary;
- add and zone controls available without drag;
- preferred-printing sheet;
- no hidden hover-only actions.

### Entry presentation

Show:

- name;
- quantity;
- zone;
- owned/required/missing;
- preferred printing/price when selected;
- validation indicators;
- action menu.

## 13. Accessibility

- semantic landmarks and headings;
- complete keyboard navigation on wide layouts;
- visible focus rings;
- labels never replaced solely by placeholders;
- screen-reader labels for icon controls;
- dialog focus trapping/restoration;
- status not conveyed by color alone;
- image alt text uses card/face identity;
- reduced motion respected;
- target WCAG 2.2 AA for implemented surfaces.

## 14. Error and empty-state language

Errors should state:

- what failed;
- whether anything changed;
- the safe next action;
- request ID for support when useful.

Empty states should offer one relevant action, such as Browse Catalog, Add Card, Import CSV, or Create Deck.

## 15. Branding constraints

- Talence uses its own emblem/name, not Wizards or Magic logos as product branding.
- Card images are displayed unmodified when used.
- Required unofficial/provider attribution and legal notices are placed in an appropriate footer/about surface after legal review.
