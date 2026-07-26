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

- `/` — static landing/private-beta explanation
- `/login`
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

- sticky top navigation, 56px;
- optional fixed contextual left rail, 240px;
- independently scrolling main content;
- page header with title, context, and primary action;
- main content may be constrained or full-width.

### Compact layout

- compact top bar with Talence mark, context title, and account/action menu;
- bottom primary navigation for Dashboard, Catalog, Collections, Decks, and More;
- contextual sidebars become sheets/drawers;
- primary create/add actions remain reachable near the thumb zone;
- tables become semantic stacked rows/cards when columns cannot remain readable.

## 5. Content width modes

### Constrained

Forms, prose, settings, and focused detail sections.

- maximum width approximately 960–1200px depending on content;
- centered;
- 16px compact / 24px wide horizontal padding.

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
- Gold: `#C29A3A`
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
- no gradients, glassmorphism, neon effects, or large gold backgrounds.

### Shape and depth

- consistent modest radius, recommended 6px;
- borders and spacing create structure;
- shadows only for overlays and subtle elevation;
- no bubbly cards or floating-dashboard clutter.

### Typography

- one sans-serif family, recommended Inter through `next/font` or a system fallback;
- weights 400, 500, 600, optional 700 only for limited emphasis;
- scale: 12, 14, 16, 20, 24, 32px;
- default UI text 14px;
- numeric columns use tabular numbers;
- no decorative display fonts.

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
- PriceDisplay with provider/freshness
- QuantityStepper
- FilterBar/FilterDrawer

Feature code composes these primitives instead of recreating controls.

## 10. Catalog UX

### Browse

- search remains visible;
- active filters are visible as removable chips/summary;
- filter drawer on compact screens;
- table and grid toggle;
- result count and catalog freshness;
- cards show name, set, image, available finishes, and price estimate when available.

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
