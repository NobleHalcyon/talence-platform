import Link from "next/link";

import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  FormField,
  Panel,
  StatusBadge,
  TextInput,
} from "@talence/ui";

import { createCollectionAction, updateCollectionAction } from "@/features/collections/actions";
import type {
  CollectionDetail,
  CollectionListPage,
  CollectionStatusFilter,
} from "@/features/collections/types";

import { formatInstant, formatMoney, formatPriceProviders } from "./collection-shared";
import { CollectionLifecycleControl } from "./lifecycle-control";
import styles from "./collections.module.css";

export function CollectionCreateForm() {
  return (
    <details className={styles.actionDisclosure}>
      <summary>Create collection</summary>
      <form className={styles.formStack} action={createCollectionAction}>
        <FormField inputId="collection-name" label="Collection name">
          <TextInput name="name" maxLength={120} required autoComplete="off" />
        </FormField>
        <FormField
          inputId="collection-description"
          label="Description"
          hint="Optional plain-text context, up to 4,000 characters."
        >
          <textarea className={styles.textarea} name="description" maxLength={4_000} rows={4} />
        </FormField>
        <FormField
          inputId="collection-cover"
          label="Cover printing ID"
          hint="Optional exact active printing UUID."
        >
          <TextInput name="coverPrintingId" inputMode="text" />
        </FormField>
        <Button type="submit">Create private collection</Button>
      </form>
    </details>
  );
}

export function CollectionEditForm({ detail }: { detail: CollectionDetail }) {
  const { collection } = detail;
  if (!detail.permissions.canEdit || collection.status !== "active") return null;
  return (
    <details className={styles.actionDisclosure}>
      <summary>Edit collection details</summary>
      <form className={styles.formStack} action={updateCollectionAction}>
        <input type="hidden" name="collectionId" value={collection.id} />
        <input type="hidden" name="expectedUpdatedAt" value={collection.updatedAt} />
        <input type="hidden" name="returnTo" value={`/app/collections/${collection.id}`} />
        <FormField inputId="edit-collection-name" label="Collection name">
          <TextInput name="name" maxLength={120} required defaultValue={collection.name} />
        </FormField>
        <FormField inputId="edit-collection-description" label="Description">
          <textarea
            className={styles.textarea}
            name="description"
            maxLength={4_000}
            rows={4}
            defaultValue={collection.description ?? ""}
          />
        </FormField>
        <FormField inputId="edit-collection-cover" label="Cover printing ID">
          <TextInput name="coverPrintingId" defaultValue={collection.coverPrintingId ?? ""} />
        </FormField>
        <Button type="submit">Save details</Button>
      </form>
    </details>
  );
}

function CollectionCard({ item }: { item: CollectionListPage["items"][number] }) {
  return (
    <Panel className={styles.collectionCard}>
      <div className={styles.collectionCardHeader}>
        <div>
          <div className={styles.badgeRow}>
            <StatusBadge tone={item.status === "active" ? "success" : "warning"}>
              {item.status}
            </StatusBadge>
            {item.isDefault ? <Badge tone="information">Default</Badge> : null}
            <Badge>Private</Badge>
          </div>
          <h2>
            <Link href={`/app/collections/${item.id}`}>{item.name}</Link>
          </h2>
          <p>{item.description ?? "No description supplied."}</p>
        </div>
        <div className={styles.lifecycleActions}>
          {item.status === "active" ? (
            <CollectionLifecycleControl
              collection={item}
              operation="archive"
              disabled={!item.permissions.canArchive}
            />
          ) : (
            <CollectionLifecycleControl
              collection={item}
              operation="restore"
              disabled={!item.permissions.canEdit}
            />
          )}
          <CollectionLifecycleControl
            collection={item}
            operation="delete"
            disabled={!item.permissions.canDelete}
          />
        </div>
      </div>
      <dl className={styles.collectionStats}>
        <div>
          <dt>Quantity</dt>
          <dd>{item.totalQuantity.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Printings</dt>
          <dd>{item.uniquePrintings.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>
            {item.estimatedValue
              ? formatMoney(item.estimatedValue.amount, item.estimatedValue.currency)
              : "Unavailable"}
            <span className={styles.secondaryText}>
              {formatPriceProviders(item.priceProviders)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Unpriced</dt>
          <dd>{item.unpricedQuantity.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Last changed</dt>
          <dd>{formatInstant(item.latestTransactionAt)} UTC</dd>
        </div>
      </dl>
      <ButtonLink href={`/app/collections/${item.id}`} variant="secondary" size="small">
        Open collection
      </ButtonLink>
    </Panel>
  );
}

export function CollectionListView({
  page,
  filter,
}: {
  page: CollectionListPage;
  filter: CollectionStatusFilter;
}) {
  return (
    <div className={styles.sectionStack}>
      <nav className={styles.statusFilters} aria-label="Collection status">
        <ButtonLink
          href="/app/collections?status_filter=active"
          variant={filter === "active" ? "primary" : "secondary"}
          size="small"
        >
          Active
        </ButtonLink>
        <ButtonLink
          href="/app/collections?status_filter=archived"
          variant={filter === "archived" ? "primary" : "secondary"}
          size="small"
        >
          Archived
        </ButtonLink>
        <ButtonLink
          href="/app/collections?status_filter=all"
          variant={filter === "all" ? "primary" : "secondary"}
          size="small"
        >
          All
        </ButtonLink>
      </nav>
      {page.items.length ? (
        <div className={styles.collectionGrid}>
          {page.items.map((item) => (
            <CollectionCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={filter === "archived" ? "No archived collections" : "No collections yet"}
          message={
            filter === "archived"
              ? "Archived collections remain here when you pause an inventory container."
              : "Create a private collection, then add exact printings from the catalog."
          }
          action={
            filter === "archived" ? (
              <ButtonLink href="/app/collections" variant="secondary">
                View active collections
              </ButtonLink>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
