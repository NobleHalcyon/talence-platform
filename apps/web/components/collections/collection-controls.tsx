import { Button, FilterBar, FormField, SearchInput, Select, TextInput } from "@talence/ui";

import { persistCollectionViewAction } from "@/features/collections/actions";
import {
  collectionInventoryHref,
  collectionInventorySearchParams,
} from "@/features/collections/query";
import type { CollectionInventoryQuery } from "@/features/collections/types";

import styles from "./collections.module.css";

export function CollectionInventoryControls({
  collectionId,
  query,
}: {
  collectionId: string;
  query: CollectionInventoryQuery;
}) {
  return (
    <div className={styles.controlStack}>
      <form method="get" action={`/app/collections/${collectionId}`}>
        <FilterBar
          label="Inventory filters"
          actions={
            <>
              <input type="hidden" name="view" value={query.view} />
              <Button type="submit">Apply filters</Button>
              <a
                className={styles.clearLink}
                href={`/app/collections/${collectionId}?view=${query.view}`}
              >
                Clear
              </a>
            </>
          }
        >
          <FormField inputId="inventory-search" label="Search inventory">
            <SearchInput
              name="q"
              maxLength={120}
              defaultValue={query.query}
              placeholder="Card, set, collector number"
            />
          </FormField>
          <FormField inputId="inventory-set" label="Set code">
            <TextInput
              name="set"
              maxLength={32}
              defaultValue={query.setCode}
              autoCapitalize="characters"
            />
          </FormField>
          <FormField inputId="inventory-finish" label="Finish">
            <Select name="finish" defaultValue={query.finish}>
              <option value="">All finishes</option>
              <option value="nonfoil">Nonfoil</option>
              <option value="foil">Foil</option>
              <option value="etched">Etched</option>
            </Select>
          </FormField>
          <FormField inputId="inventory-condition" label="Condition">
            <Select name="condition" defaultValue={query.condition}>
              <option value="">All conditions</option>
              <option value="near_mint">Near mint</option>
              <option value="lightly_played">Lightly played</option>
              <option value="moderately_played">Moderately played</option>
              <option value="heavily_played">Heavily played</option>
              <option value="damaged">Damaged</option>
            </Select>
          </FormField>
          <FormField inputId="inventory-sort" label="Sort">
            <Select name="sort" defaultValue={query.sort}>
              <option value="name">Name</option>
              <option value="quantity_desc">Quantity, high to low</option>
              <option value="value_desc">Value, high to low</option>
              <option value="updated_desc">Recently updated</option>
            </Select>
          </FormField>
        </FilterBar>
      </form>
      <div className={styles.viewControls} role="group" aria-label="Inventory view">
        {(["structured", "gallery", "analytical"] as const).map((view) => (
          <form action={persistCollectionViewAction} key={view}>
            <input type="hidden" name="view" value={view} />
            <input
              type="hidden"
              name="returnTo"
              value={collectionInventoryHref(collectionId, query, {
                view,
                cursor: null,
              })}
            />
            <Button
              type="submit"
              size="small"
              variant={query.view === view ? "primary" : "secondary"}
              aria-pressed={query.view === view}
            >
              {view === "structured" ? "Structured" : view === "gallery" ? "Gallery" : "Analytical"}
            </Button>
          </form>
        ))}
      </div>
      <p className={styles.resultContext}>
        Filters and view are URL-addressable:{" "}
        <code>{collectionInventorySearchParams(query).toString()}</code>
      </p>
    </div>
  );
}
