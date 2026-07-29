"use client";

import { useMemo, useState } from "react";

import { Button, Checkbox, FormField, InlineAlert, Select, TextInput } from "@talence/ui";

import type { CollectionListItem } from "@/features/collections/types";
import { replaceDeckSourcesAction, updateDeckAction } from "@/features/decks/actions";
import type { DeckCollectionSource, DeckDetail } from "@/features/decks/types";

import styles from "./decks.module.css";

export function DeckSettingsForm({ detail }: { detail: DeckDetail }) {
  const [formatVersionId, setFormatVersionId] = useState(detail.deck.formatVersionId);
  const selectedFormat =
    detail.availableFormats.find((format) => format.formatVersionId === formatVersionId) ??
    detail.format;
  if (!detail.permissions.canEdit || detail.deck.status !== "active") return null;

  return (
    <details className={styles.actionDisclosure}>
      <summary>Edit deck details</summary>
      <form className={styles.formStack} action={updateDeckAction}>
        <input type="hidden" name="deckId" value={detail.deck.id} />
        <input type="hidden" name="expectedRevision" value={detail.deck.currentRevision} />
        <input type="hidden" name="formatCode" value={selectedFormat.code} />
        <input type="hidden" name="formatVersionId" value={selectedFormat.formatVersionId} />
        <input type="hidden" name="returnTo" value={`/app/decks/${detail.deck.id}`} />
        <FormField inputId="edit-deck-name" label="Deck name">
          <TextInput name="name" required maxLength={120} defaultValue={detail.deck.name} />
        </FormField>
        <FormField
          inputId="edit-deck-format"
          label="Format"
          hint={`Rule configuration is pinned on save. Current selection: ${selectedFormat.rulesVersion}.`}
        >
          <Select
            id="edit-deck-format"
            name="formatSelection"
            value={formatVersionId}
            onChange={(event) => setFormatVersionId(event.target.value)}
          >
            {detail.availableFormats.map((format) => (
              <option
                key={format.formatVersionId}
                value={format.formatVersionId}
                disabled={!format.active && format.formatVersionId !== detail.deck.formatVersionId}
              >
                {format.name} - {format.rulesVersion}
                {!format.active ? " (inactive, retained)" : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField inputId="edit-deck-description" label="Description">
          <textarea
            id="edit-deck-description"
            className={styles.textarea}
            name="description"
            maxLength={4_000}
            rows={3}
            defaultValue={detail.deck.description ?? ""}
          />
        </FormField>
        <FormField inputId="edit-deck-notes" label="Notes" hint="Plain text only.">
          <textarea
            id="edit-deck-notes"
            className={styles.textarea}
            name="notes"
            maxLength={8_000}
            rows={4}
            defaultValue={detail.deck.notes ?? ""}
          />
        </FormField>
        <FormField inputId="edit-deck-tags" label="Tags" hint="Comma-separated, up to 20 tags.">
          <TextInput name="tags" maxLength={819} defaultValue={detail.deck.tags.join(", ")} />
        </FormField>
        <FormField
          inputId="edit-deck-cover"
          label="Cover / preferred commander printing ID"
          hint="Optional exact active printing UUID. Existing inactive covers remain visible until changed."
        >
          <TextInput
            name="coverPrintingId"
            defaultValue={detail.deck.coverPrintingId ?? ""}
            autoComplete="off"
          />
        </FormField>
        <Button type="submit">Save deck details</Button>
      </form>
    </details>
  );
}

interface SourceOption extends DeckCollectionSource {
  isDefault?: boolean;
}

export function DeckSourceControl({
  detail,
  collections,
  collectionsAvailable,
}: {
  detail: DeckDetail;
  collections: CollectionListItem[];
  collectionsAvailable: boolean;
}) {
  const options = useMemo(() => {
    const byId = new Map<string, SourceOption>();
    for (const source of detail.sources) byId.set(source.collectionId, source);
    for (const collection of collections) {
      if (!byId.has(collection.id) && collection.status !== "deleted") {
        byId.set(collection.id, {
          collectionId: collection.id,
          name: collection.name,
          priority: byId.size,
          selected: false,
          status: collection.status,
          isDefault: collection.isDefault,
        });
      }
    }
    return [...byId.values()].sort(
      (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
    );
  }, [collections, detail.sources]);
  const archivedSelected = options.filter(
    (source) => source.selected && source.status === "archived",
  );
  if (!detail.permissions.canEdit || detail.deck.status !== "active") return null;
  return (
    <details className={styles.actionDisclosure}>
      <summary>Choose collection sources</summary>
      <form className={styles.formStack} action={replaceDeckSourcesAction}>
        <input type="hidden" name="deckId" value={detail.deck.id} />
        <input type="hidden" name="expectedRevision" value={detail.deck.currentRevision} />
        <input type="hidden" name="returnTo" value={`/app/decks/${detail.deck.id}`} />
        <p className={styles.secondaryText}>
          Priority follows the order shown. Each physical copy can be allocated only once across
          required zones.
        </p>
        {!collectionsAvailable ? (
          <InlineAlert title="Collection sources are unavailable" tone="warning">
            Source choices could not be loaded. Existing selections are shown read-only and cannot
            be cleared until the collection list loads successfully.
          </InlineAlert>
        ) : null}
        {archivedSelected.length ? (
          <InlineAlert title="Archived source still counted" tone="warning">
            {archivedSelected.map((source) => source.name).join(", ")} remains selected and its
            inventory still counts. Clear it below to exclude those copies.
          </InlineAlert>
        ) : null}
        <fieldset className={styles.sourceFieldset}>
          <legend>Ownership sources</legend>
          {options.length ? (
            options.map((source) => (
              <Checkbox
                key={source.collectionId}
                name="collectionIds"
                value={source.collectionId}
                label={`${source.name}${source.status === "archived" ? " (archived, still counted)" : ""}`}
                defaultChecked={source.selected}
                disabled={!collectionsAvailable}
              />
            ))
          ) : (
            <p>No active or already-selected collection is available.</p>
          )}
        </fieldset>
        <Button type="submit" disabled={!collectionsAvailable}>
          Recalculate from selected sources
        </Button>
      </form>
    </details>
  );
}
