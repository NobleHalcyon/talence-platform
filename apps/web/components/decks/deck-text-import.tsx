"use client";

import { useActionState, useRef, useState } from "react";

import {
  Button,
  ConfirmDialog,
  FormField,
  InlineAlert,
  Panel,
  Select,
  StatusBadge,
} from "@talence/ui";

import { commitDeckImportAction, stageDeckImportAction } from "@/features/decks/actions";
import {
  MAX_DECK_IMPORT_BYTES,
  MAX_DECK_IMPORT_LINES,
  type DeckImportStageState,
} from "@/features/decks/text-import";
import type { DeckDetail } from "@/features/decks/types";

import styles from "./decks.module.css";

const INITIAL_STATE: DeckImportStageState = { status: "idle" };

function statusTone(status: "exact" | "ambiguous" | "unresolved") {
  return status === "exact" ? "success" : status === "ambiguous" ? "warning" : "danger";
}

function resolutionDescription(status: "exact" | "ambiguous" | "unresolved"): string {
  if (status === "exact") return "One exact normalized oracle name matched.";
  if (status === "ambiguous")
    return "More than one active oracle row has this exact normalized name. Choose explicitly.";
  return "No exact normalized oracle name matched. Suggestions are informational only.";
}

function ImportCommitForm({
  detail,
  state,
}: {
  detail: DeckDetail;
  state: Extract<DeckImportStageState, { status: "ready" }>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const unselectableAmbiguity = state.rows.some(
    (row) => row.status === "ambiguous" && row.candidates.length === 0,
  );
  const blocked = state.counts.unresolved > 0 || unselectableAmbiguity;
  const reviewRows = state.rows.map((row) => ({
    lineId: row.lineId,
    name: row.name,
    zone: row.zone,
    quantity: row.quantity,
  }));

  return (
    <>
      <form
        ref={formRef}
        className={styles.importCommitForm}
        action={commitDeckImportAction}
        onSubmit={(event) => {
          if (blocked) event.preventDefault();
        }}
      >
        <input type="hidden" name="deckId" value={detail.deck.id} />
        <input type="hidden" name="expectedRevision" value={detail.deck.currentRevision} />
        <input type="hidden" name="reviewRows" value={JSON.stringify(reviewRows)} />
        <div className={styles.importReviewList} role="list" aria-label="Deck import review">
          {state.rows.map((row) => (
            <article className={styles.importReviewRow} role="listitem" key={row.lineId}>
              <header className={styles.importReviewHeader}>
                <div>
                  <strong>
                    {row.quantity} {row.name}
                  </strong>
                  <p>
                    Source line {row.lineNumber} · {row.zone}
                  </p>
                </div>
                <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
              </header>
              <p>{resolutionDescription(row.status)}</p>
              {row.status === "exact" ? (
                <div className={styles.importCandidate}>
                  <strong>{row.candidates[0]?.name}</strong>
                  <span>
                    {row.candidates[0]?.manaCost ?? "No mana cost"} ·{" "}
                    {row.candidates[0]?.typeLine ?? "Type unavailable"}
                  </span>
                </div>
              ) : row.status === "ambiguous" && row.candidates.length ? (
                <FormField
                  inputId={`resolution-${row.lineId}`}
                  label={`Resolve source line ${row.lineNumber}`}
                  hint="This explicit choice is revalidated against the current catalog when committed."
                >
                  <Select
                    id={`resolution-${row.lineId}`}
                    name={`resolution_${row.lineId}`}
                    defaultValue=""
                    required
                  >
                    <option value="">Choose one exact oracle card</option>
                    {row.candidates.map((candidate) => (
                      <option key={candidate.cardId} value={candidate.cardId}>
                        {candidate.name} · {candidate.manaCost ?? "no mana cost"} ·{" "}
                        {candidate.typeLine ?? "type unavailable"}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : row.status === "ambiguous" ? (
                <InlineAlert title="Candidate detail omitted by safety limit" tone="warning">
                  This name has {row.candidateCount.toLocaleString("en-US")} exact oracle matches,
                  but candidate output was bounded. Split or correct the input and stage it again;
                  this row cannot be committed.
                </InlineAlert>
              ) : row.candidates.length ? (
                <div className={styles.importSuggestions}>
                  <strong>Possible catalog names</strong>
                  <ul>
                    {row.candidates.map((candidate) => (
                      <li key={candidate.cardId}>{candidate.name}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>No catalog suggestions are available.</p>
              )}
            </article>
          ))}
        </div>
        {blocked ? (
          <InlineAlert title="Unresolved review blocks replacement" tone="warning">
            Edit the source text so every card resolves exactly and every ambiguous row offers an
            explicit choice, then stage it again. Suggested names are never selected silently.
          </InlineAlert>
        ) : (
          <Button type="button" onClick={() => setConfirming(true)}>
            Review atomic replacement
          </Button>
        )}
      </form>
      <ConfirmDialog
        open={confirming}
        title="Replace every deck entry?"
        description="This applies the reviewed oracle cards as one atomic revision."
        confirmLabel="Replace deck entries"
        dangerous
        busy={submitting}
        onCancel={() => {
          setConfirming(false);
          setSubmitting(false);
        }}
        onConfirm={() => {
          if (!formRef.current?.reportValidity()) return;
          setSubmitting(true);
          formRef.current.requestSubmit();
        }}
      >
        Existing entries in every zone, including the maybeboard, and all entry notes,
        preferred-printing choices, and preferred finishes will be replaced. Imported entries start
        without those preferences. If the deck revision or catalog resolution changed, nothing will
        be overwritten.
      </ConfirmDialog>
    </>
  );
}

export function DeckTextImportWorkflow({
  detail,
  preview = false,
}: {
  detail: DeckDetail;
  preview?: boolean;
}) {
  const [state, action, pending] = useActionState(stageDeckImportAction, INITIAL_STATE);
  const canImport = detail.permissions.canEdit && detail.deck.status === "active";

  return (
    <div className={styles.importStack}>
      <Panel>
        {canImport ? (
          <form className={styles.importStageForm} action={action}>
            <input type="hidden" name="deckId" value={detail.deck.id} />
            <input type="hidden" name="expectedRevision" value={detail.deck.currentRevision} />
            <FormField
              inputId="deck-import-file"
              label="Deck text file"
              hint={`Optional UTF-8 .txt file, maximum ${MAX_DECK_IMPORT_BYTES / 1024} KiB. A selected file takes precedence over pasted text.`}
            >
              <input
                id="deck-import-file"
                className={styles.fileInput}
                type="file"
                name="deckFile"
                accept=".txt,text/plain"
              />
            </FormField>
            <FormField
              inputId="deck-import-text"
              label="Deck text"
              hint={`Paste up to ${MAX_DECK_IMPORT_LINES.toLocaleString("en-US")} lines as “4 Card Name”. Use [commander], [companion], [mainboard], [sideboard], or [maybeboard] headers; mainboard is the default.`}
            >
              <textarea
                id="deck-import-text"
                className={styles.importTextarea}
                name="deckText"
                rows={14}
                defaultValue={
                  preview
                    ? "[commander]\n1 Delver of Secrets // Insectile Aberration\n\n[mainboard]\n1 Black Lotus\n4 Lightning Bolt\n"
                    : undefined
                }
              />
            </FormField>
            <Button type="submit" busy={pending}>
              Parse and resolve oracle cards
            </Button>
          </form>
        ) : (
          <InlineAlert title="Deck import is read-only" tone="information">
            Restore this deck and use an editor role before staging an atomic replacement.
          </InlineAlert>
        )}
      </Panel>
      {state.status === "error" ? (
        <InlineAlert title="Import did not stage" tone="danger">
          {state.message} Request ID: {state.requestId}.
          <ul className={styles.importErrorList}>
            {state.errors.map((error, index) => (
              <li key={`${error.code}-${error.lineNumber ?? "file"}-${index}`}>{error.message}</li>
            ))}
          </ul>
        </InlineAlert>
      ) : null}
      {state.status === "ready" ? (
        <section className={styles.importPreview} aria-labelledby="deck-import-review-title">
          <header>
            <div>
              <p className={styles.regionEyebrow}>Ephemeral review</p>
              <h2 id="deck-import-review-title">Resolved decklist</h2>
            </div>
            <StatusBadge tone={state.counts.unresolved ? "warning" : "success"}>
              {state.counts.unresolved ? "Needs edits" : "Ready to confirm"}
            </StatusBadge>
          </header>
          <p>
            {state.physicalLineCount.toLocaleString("en-US")} source lines ·{" "}
            {state.byteCount.toLocaleString("en-US")} bytes. Raw source text was parsed in this
            request and was not persisted.
          </p>
          <div className={styles.importCounts} aria-label="Deck import resolution counts">
            <Panel>
              <span>Exact</span>
              <strong>{state.counts.exact}</strong>
            </Panel>
            <Panel>
              <span>Ambiguous</span>
              <strong>{state.counts.ambiguous}</strong>
            </Panel>
            <Panel>
              <span>Unresolved</span>
              <strong>{state.counts.unresolved}</strong>
            </Panel>
          </div>
          <ImportCommitForm detail={detail} state={state} />
        </section>
      ) : null}
    </div>
  );
}
