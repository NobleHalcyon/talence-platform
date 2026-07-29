"use client";

import { useRef, useState } from "react";

import { Button, ConfirmDialog } from "@talence/ui";

import { deckLifecycleAction, duplicateDeckAction } from "@/features/decks/actions";
import type { DeckRecord } from "@/features/decks/types";

export function DeckLifecycleControl({
  deck,
  operation,
  disabled = false,
}: {
  deck: DeckRecord;
  operation: "archive" | "restore" | "delete";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const labels = { archive: "Archive", restore: "Restore", delete: "Delete" };
  const descriptions = {
    archive: "The deck stays private and keeps entries, sources, and validation evidence.",
    restore: "The deck becomes active and editable again.",
    delete: "The deck leaves ordinary views. This action requires explicit confirmation.",
  };
  return (
    <>
      <form ref={formRef} action={deckLifecycleAction}>
        <input type="hidden" name="deckId" value={deck.id} />
        <input type="hidden" name="expectedRevision" value={deck.currentRevision} />
        <input type="hidden" name="operation" value={operation} />
        <input type="hidden" name="returnTo" value={`/app/decks/${deck.id}`} />
        <Button
          size="small"
          variant={operation === "delete" ? "danger" : "secondary"}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          {labels[operation]}
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={`${labels[operation]} ${deck.name}?`}
        description={descriptions[operation]}
        confirmLabel={labels[operation]}
        dangerous={operation === "delete"}
      >
        <p>{descriptions[operation]}</p>
      </ConfirmDialog>
    </>
  );
}

export function DuplicateDeckControl({
  deck,
  disabled = false,
}: {
  deck: DeckRecord;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={formRef} action={duplicateDeckAction}>
        <input type="hidden" name="deckId" value={deck.id} />
        <input type="hidden" name="expectedRevision" value={deck.currentRevision} />
        <input type="hidden" name="name" value={`${deck.name} copy`} />
        <Button
          size="small"
          variant="secondary"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          Duplicate
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={`Duplicate ${deck.name}?`}
        description="Entries and ordered collection sources will be copied into a new private deck."
        confirmLabel="Duplicate deck"
      >
        <p>The original deck remains unchanged.</p>
      </ConfirmDialog>
    </>
  );
}
