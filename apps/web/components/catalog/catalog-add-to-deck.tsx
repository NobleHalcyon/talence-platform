"use client";

import { useState } from "react";

import { Button, Dialog, FormField, IconButton, NumberInput, Select } from "@talence/ui";

import { addDeckEntryAction } from "@/features/decks/actions";
import type { CatalogDeckOption } from "@/features/catalog/types";

import styles from "./catalog.module.css";

export function CatalogAddToDeck({
  cardId,
  name,
  decks,
}: {
  cardId: string | null;
  name: string;
  decks: CatalogDeckOption[];
}) {
  const [open, setOpen] = useState(false);
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const selectedDeck = decks.find((deck) => deck.id === deckId) ?? null;
  const disabled = !cardId || !selectedDeck;

  return (
    <>
      <IconButton label="Add to deck" onClick={() => setOpen(true)} disabled={disabled}>
        <ListPlusIcon />
      </IconButton>
      {cardId && selectedDeck ? (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title={`Add ${name} to a deck`}
          description="Choose a deck, zone, and quantity."
        >
          <form className={styles.quickActionForm} action={addDeckEntryAction}>
            <input type="hidden" name="deckId" value={selectedDeck.id} />
            <input type="hidden" name="expectedRevision" value={selectedDeck.currentRevision} />
            <input type="hidden" name="cardId" value={cardId} />
            <input type="hidden" name="preferredPrintingId" value="" />
            <input type="hidden" name="preferredFinish" value="" />
            <input type="hidden" name="returnTo" value={`/app/decks/${selectedDeck.id}`} />
            <FormField inputId={`catalog-deck-${cardId}`} label="Deck">
              <Select value={deckId} onChange={(event) => setDeckId(event.currentTarget.value)}>
                {decks.map((deck) => (
                  <option value={deck.id} key={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField inputId={`catalog-deck-zone-${cardId}`} label="Zone">
              <Select name="zone" defaultValue="mainboard">
                <option value="mainboard">Mainboard</option>
                <option value="sideboard">Sideboard</option>
                <option value="commander">Commander</option>
                <option value="companion">Companion</option>
                <option value="maybeboard">Maybeboard</option>
              </Select>
            </FormField>
            <FormField inputId={`catalog-deck-quantity-${cardId}`} label="Quantity">
              <NumberInput name="quantity" min={1} max={999} defaultValue={1} />
            </FormField>
            <Button type="submit">Add to deck</Button>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

function ListPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7 6.5h10M7 11.5h7M7 16.5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M17 13.75v5M14.5 16.25h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="3.75" cy="6.5" r=".8" fill="currentColor" />
      <circle cx="3.75" cy="11.5" r=".8" fill="currentColor" />
      <circle cx="3.75" cy="16.5" r=".8" fill="currentColor" />
    </svg>
  );
}
