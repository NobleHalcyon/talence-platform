import Link from "next/link";

import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  EmptyState,
  FormField,
  Panel,
  Select,
  StatusBadge,
  TextInput,
} from "@talence/ui";

import type { CollectionListItem } from "@/features/collections/types";
import { createDeckAction } from "@/features/decks/actions";
import type { DeckFormat, DeckListPage, DeckStatusFilter } from "@/features/decks/types";

import { DeckLifecycleControl, DuplicateDeckControl } from "./deck-lifecycle-control";
import styles from "./decks.module.css";

export function DeckCreateForm({
  formats,
  collections,
}: {
  formats: DeckFormat[];
  collections: CollectionListItem[];
}) {
  return (
    <details className={styles.actionDisclosure}>
      <summary>Create deck</summary>
      <form className={styles.formStack} action={createDeckAction}>
        <FormField inputId="deck-name" label="Deck name">
          <TextInput name="name" required maxLength={120} autoComplete="off" />
        </FormField>
        <FormField inputId="deck-format" label="Format">
          <Select name="formatCode" required defaultValue={formats[0]?.code}>
            {formats
              .filter((format) => format.active)
              .map((format) => (
                <option value={format.code} key={format.code}>
                  {format.name} - {format.rulesVersion}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField inputId="deck-description" label="Description">
          <textarea
            id="deck-description"
            className={styles.textarea}
            name="description"
            maxLength={4_000}
            rows={3}
          />
        </FormField>
        <FormField inputId="deck-notes" label="Notes">
          <textarea
            id="deck-notes"
            className={styles.textarea}
            name="notes"
            maxLength={8_000}
            rows={3}
          />
        </FormField>
        <FormField inputId="deck-tags" label="Tags" hint="Comma-separated, up to 20 tags.">
          <TextInput name="tags" maxLength={819} placeholder="control, testing" />
        </FormField>
        <fieldset className={styles.sourceFieldset}>
          <legend>Initial inventory sources</legend>
          <p>Ownership allocates finite copies from these collections in the order shown.</p>
          {collections.length ? (
            collections.map((collection) => (
              <Checkbox
                key={collection.id}
                name="collectionIds"
                value={collection.id}
                label={collection.name}
                defaultChecked={collection.isDefault}
              />
            ))
          ) : (
            <p>No active collection is available. You may create the deck without a source.</p>
          )}
        </fieldset>
        <Button type="submit" disabled={!formats.some((format) => format.active)}>
          Create private deck
        </Button>
      </form>
    </details>
  );
}

function DeckCard({ item }: { item: DeckListPage["items"][number] }) {
  return (
    <Panel className={styles.deckCard}>
      <div className={styles.deckCardHeader}>
        <div>
          <div className={styles.badgeRow}>
            <StatusBadge tone={item.status === "active" ? "success" : "warning"}>
              {item.status}
            </StatusBadge>
            <Badge>{item.formatName}</Badge>
            <Badge>Private</Badge>
          </div>
          <h2>
            <Link href={`/app/decks/${item.id}`}>{item.name}</Link>
          </h2>
          <p>{item.description ?? "No description supplied."}</p>
          {item.tags.length ? (
            <ul className={styles.tagList} aria-label={`${item.name} tags`}>
              {item.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className={styles.actionRow}>
          <DuplicateDeckControl deck={item} disabled={!item.permissions.canDuplicate} />
          {item.status === "active" ? (
            <DeckLifecycleControl
              deck={item}
              operation="archive"
              disabled={!item.permissions.canArchive}
            />
          ) : (
            <DeckLifecycleControl
              deck={item}
              operation="restore"
              disabled={!item.permissions.canRestore}
            />
          )}
          <DeckLifecycleControl
            deck={item}
            operation="delete"
            disabled={!item.permissions.canDelete}
          />
        </div>
      </div>
      <dl className={styles.deckStats}>
        <div>
          <dt>Entries</dt>
          <dd>{item.entryCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Required</dt>
          <dd>{item.requiredQuantity.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Missing</dt>
          <dd>{item.missingQuantity.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Maybeboard</dt>
          <dd>{item.maybeboardQuantity.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{item.sourceCount.toLocaleString()}</dd>
        </div>
      </dl>
      <ButtonLink href={`/app/decks/${item.id}`} variant="secondary" size="small">
        Open deck builder
      </ButtonLink>
    </Panel>
  );
}

export function DeckListView({ page, filter }: { page: DeckListPage; filter: DeckStatusFilter }) {
  return (
    <div className={styles.sectionStack}>
      <nav className={styles.statusFilters} aria-label="Deck status">
        {(["active", "archived", "all"] as const).map((value) => (
          <ButtonLink
            key={value}
            href={`/app/decks?status_filter=${value}`}
            variant={filter === value ? "primary" : "secondary"}
            size="small"
          >
            {value.slice(0, 1).toUpperCase()}
            {value.slice(1)}
          </ButtonLink>
        ))}
      </nav>
      {page.items.length ? (
        <div className={styles.deckGrid}>
          {page.items.map((item) => (
            <DeckCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={filter === "archived" ? "No archived decks" : "No decks yet"}
          message={
            filter === "archived"
              ? "Archived decks remain here until restored or deleted."
              : "Create a private deck, select inventory sources, then add oracle cards."
          }
        />
      )}
    </div>
  );
}
