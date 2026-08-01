import { Button, Select } from "@talence/ui";

import { ProgressiveFilterControls } from "@/components/filters/progressive-filter-controls";
import { persistCollectionViewAction } from "@/features/collections/actions";
import { collectionInventoryHref } from "@/features/collections/query";
import type { CollectionInventoryQuery } from "@/features/collections/types";

import styles from "./collections.module.css";

export function CollectionInventoryControls({
  collectionId,
  query,
  resultCount,
}: {
  collectionId: string;
  query: CollectionInventoryQuery;
  resultCount?: number | null;
}) {
  const action = `/app/collections/${collectionId}`;
  return (
    <div className={styles.controlStack}>
      <ProgressiveFilterControls
        action={action}
        query={query.query}
        filters={query.filters}
        scope="collection"
        preservedParameters={{
          sort: query.sort === "name" ? null : query.sort,
          view: query.view,
        }}
        resultCount={resultCount}
      />
      <div className={styles.viewControls}>
        <form method="get" action={action} className={styles.sortControl}>
          <input type="hidden" name="q" value={query.query} />
          {query.filters.children.length ? (
            <input type="hidden" name="filters" value={JSON.stringify(query.filters)} />
          ) : null}
          <input type="hidden" name="view" value={query.view} />
          <label htmlFor="collection-sort">Sort</label>
          <Select id="collection-sort" name="sort" defaultValue={query.sort}>
            <option value="name">Name</option>
            <option value="quantity_desc">Quantity, high to low</option>
            <option value="value_desc">Value, high to low</option>
            <option value="updated_desc">Recently updated</option>
          </Select>
          <Button type="submit" size="small" variant="secondary">
            Apply sort
          </Button>
        </form>
        <div role="group" aria-label="Inventory view" className={styles.viewControls}>
          {(["structured", "gallery", "analytical"] as const).map((view) => (
            <form action={persistCollectionViewAction} key={view}>
              <input type="hidden" name="view" value={view} />
              <input
                type="hidden"
                name="returnTo"
                value={collectionInventoryHref(collectionId, query, { view, cursor: null })}
              />
              <Button
                type="submit"
                size="small"
                variant={query.view === view ? "primary" : "secondary"}
                aria-pressed={query.view === view}
              >
                {view === "structured"
                  ? "Structured"
                  : view === "gallery"
                    ? "Gallery"
                    : "Analytical"}
              </Button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
