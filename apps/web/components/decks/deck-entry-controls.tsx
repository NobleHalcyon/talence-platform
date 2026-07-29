"use client";

import { useRef, useState } from "react";

import { Button, Combobox, ConfirmDialog, FormField, QuantityStepper, Select } from "@talence/ui";

import { removeDeckEntryAction, updateDeckEntryAction } from "@/features/decks/actions";
import type { DeckEntry } from "@/features/decks/types";

import styles from "./decks.module.css";

const ZONES = [
  ["mainboard", "Mainboard"],
  ["sideboard", "Sideboard"],
  ["commander", "Commander"],
  ["companion", "Companion"],
  ["maybeboard", "Maybeboard"],
] as const;

export function DeckEntryControls({
  entry,
  deckId,
  returnTo,
  disabled,
}: {
  entry: DeckEntry;
  deckId: string;
  returnTo: string;
  disabled: boolean;
}) {
  const [quantity, setQuantity] = useState(entry.quantity);
  const [preferredPrintingId, setPreferredPrintingId] = useState(entry.preferredPrintingId ?? "");
  const [preferredFinish, setPreferredFinish] = useState(entry.preferredFinish ?? "");
  const [removeOpen, setRemoveOpen] = useState(false);
  const removeRef = useRef<HTMLFormElement>(null);
  const printingOptions = entry.card.printingChoices.map((printing) => ({
    value: printing.printingId,
    label: `${printing.setCode} #${printing.collectorNumber}${printing.active ? "" : " (inactive)"}`,
  }));

  return (
    <div className={styles.entryControls}>
      <details>
        <summary>Edit quantity, zone, printing, or note</summary>
        <form className={styles.entryForm} action={updateDeckEntryAction}>
          <input type="hidden" name="deckId" value={deckId} />
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="expectedRevision" value={entry.currentRevision} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="quantity" value={quantity} />
          <FormField inputId={`entry-${entry.id}-quantity`} label="Required quantity">
            <div id={`entry-${entry.id}-quantity`}>
              <QuantityStepper
                value={quantity}
                min={1}
                max={999}
                disabled={disabled}
                label={`${entry.card.name} quantity`}
                onChange={setQuantity}
              />
            </div>
          </FormField>
          <FormField inputId={`entry-${entry.id}-zone`} label="Zone">
            <Select name="zone" defaultValue={entry.zone} disabled={disabled}>
              {ZONES.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            inputId={`entry-${entry.id}-printing`}
            label="Preferred printing"
            hint="Optional exact printing. Leave blank to value and own at oracle level only."
          >
            <Combobox
              name="preferredPrintingId"
              options={printingOptions}
              value={preferredPrintingId}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value.trim();
                setPreferredPrintingId(next);
                if (!next) setPreferredFinish("");
                if (next && !preferredFinish) setPreferredFinish("nonfoil");
              }}
            />
          </FormField>
          <FormField
            inputId={`entry-${entry.id}-finish`}
            label="Preferred finish"
            hint="A finish is required whenever a preferred printing is selected."
          >
            <Select
              name="preferredFinish"
              value={preferredFinish}
              disabled={disabled || !preferredPrintingId}
              onChange={(event) => setPreferredFinish(event.target.value)}
            >
              <option value="">No exact finish</option>
              <option value="nonfoil">Nonfoil</option>
              <option value="foil">Foil</option>
              <option value="etched">Etched</option>
            </Select>
          </FormField>
          <FormField inputId={`entry-${entry.id}-notes`} label="Entry note" hint="Plain text only.">
            <textarea
              id={`entry-${entry.id}-notes`}
              className={styles.textarea}
              name="notes"
              rows={2}
              maxLength={2_000}
              defaultValue={entry.notes ?? ""}
              disabled={disabled}
            />
          </FormField>
          <Button type="submit" size="small" disabled={disabled}>
            Save entry changes
          </Button>
        </form>
      </details>
      <form ref={removeRef} action={removeDeckEntryAction}>
        <input type="hidden" name="deckId" value={deckId} />
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="expectedRevision" value={entry.currentRevision} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button
          type="submit"
          size="small"
          variant="danger"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            setRemoveOpen(true);
          }}
        >
          Remove
        </Button>
      </form>
      <ConfirmDialog
        open={removeOpen}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => {
          setRemoveOpen(false);
          removeRef.current?.requestSubmit();
        }}
        title={`Remove ${entry.card.name}?`}
        description="The oracle requirement is removed from this zone. Collection inventory is not changed."
        confirmLabel="Remove entry"
        dangerous
      >
        <p>Ownership allocation and advisory validation will be recalculated.</p>
      </ConfirmDialog>
    </div>
  );
}
