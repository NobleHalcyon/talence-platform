import { Badge, ButtonLink, ErrorState, InlineAlert } from "@talence/ui";

import type { DeckLoadFailureReason } from "@/features/decks/types";

import styles from "./decks.module.css";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const STATUS_MESSAGES: Record<
  string,
  { title: string; message: string; tone?: "success" | "warning" }
> = {
  deck_created: {
    title: "Deck created",
    message: "The private workspace deck is ready to edit.",
    tone: "success",
  },
  deck_updated: {
    title: "Deck details saved",
    message: "The format, presentation details, notes, and tags were reconciled.",
    tone: "success",
  },
  deck_duplicated: {
    title: "Deck duplicated",
    message: "Entries and selected collection sources were copied into a new private deck.",
    tone: "success",
  },
  deck_archived: {
    title: "Deck archived",
    message: "The deck remains private and can be restored later.",
    tone: "success",
  },
  deck_restored: {
    title: "Deck restored",
    message: "The deck is active and editable again.",
    tone: "success",
  },
  deck_deleted: {
    title: "Deck deleted",
    message: "The deck was removed from ordinary views.",
    tone: "success",
  },
  entry_added: {
    title: "Oracle card added",
    message: "Ownership and advisory validation were recalculated.",
    tone: "success",
  },
  entry_updated: {
    title: "Deck entry updated",
    message: "Quantity, zone, notes, and preferred printing were reconciled.",
    tone: "success",
  },
  entry_removed: {
    title: "Deck entry removed",
    message: "Ownership allocation and validation were recalculated.",
    tone: "success",
  },
  sources_updated: {
    title: "Inventory sources updated",
    message: "Finite owned copies were reallocated across required deck zones.",
    tone: "success",
  },
  deck_imported: {
    title: "Decklist replaced",
    message: "The reviewed oracle entries replaced the prior deck atomically.",
    tone: "success",
  },
  import_unresolved: {
    title: "Unresolved card names",
    message:
      "Nothing changed. Edit the deck text so every row has an exact active oracle name, then stage it again.",
    tone: "warning",
  },
  import_ambiguous: {
    title: "Ambiguous card choice required",
    message:
      "Nothing changed. Restage the text and explicitly choose one oracle card for every ambiguous row.",
    tone: "warning",
  },
  import_invalid: {
    title: "Import review expired or invalid",
    message: "Nothing changed. Reload the deck and stage the bounded text again.",
    tone: "warning",
  },
  stale_deck: {
    title: "Deck changed elsewhere",
    message: "Nothing was overwritten. Reload and apply your change against the current deck.",
    tone: "warning",
  },
  duplicate_entry: {
    title: "Entry already exists",
    message: "Use the existing oracle card in that zone instead of creating a duplicate.",
    tone: "warning",
  },
  preferred_printing_invalid: {
    title: "Preferred printing was not saved",
    message:
      "Choose an active printing of the same oracle card and one of that printing's finishes.",
    tone: "warning",
  },
  source_invalid: {
    title: "Inventory sources were not changed",
    message: "Choose active or already-selected archived collections in this workspace.",
    tone: "warning",
  },
  mutation_failed: {
    title: "Deck change failed",
    message: "Nothing changed. Reload and try the action again.",
    tone: "warning",
  },
  permission_denied: {
    title: "Permission denied",
    message: "Your current workspace role cannot make that deck change. Nothing changed.",
    tone: "warning",
  },
  not_found: {
    title: "Deck resource not found",
    message: "The deck or entry is unavailable in this workspace. Nothing changed.",
    tone: "warning",
  },
  invalid_response: {
    title: "Deck response could not be verified",
    message: "Nothing changed. Reload before trying again.",
    tone: "warning",
  },
  request_failed: {
    title: "Deck request failed safely",
    message: "Nothing changed. Reload and try again.",
    tone: "warning",
  },
};

export function DeckStatusNotice({
  status,
  requestId,
}: {
  status: string | string[] | undefined;
  requestId: string | string[] | undefined;
}) {
  const normalized = first(status);
  if (!normalized) return null;
  const notice = STATUS_MESSAGES[normalized] ?? {
    title: "Deck action needs attention",
    message: "Nothing changed. Check the values and try again.",
    tone: "warning" as const,
  };
  const candidateReference = first(requestId);
  const reference = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    candidateReference,
  )
    ? candidateReference
    : "";
  return (
    <InlineAlert title={notice.title} tone={notice.tone ?? "success"}>
      {notice.message}
      {reference ? ` Support reference: ${reference}.` : ""}
    </InlineAlert>
  );
}

export function DeckPreviewBadge() {
  return (
    <p className={styles.previewNotice}>
      <Badge tone="information">Deterministic preview data</Badge>
      Mutations demonstrate the complete redirect and feedback flow without persisting data.
    </p>
  );
}

export function DeckReadErrorState({
  reason,
  requestId,
  subject,
  retryHref,
}: {
  reason: DeckLoadFailureReason;
  requestId: string;
  subject: string;
  retryHref: string;
}) {
  if (reason === "permission_denied") {
    return (
      <ErrorState
        title="Permission denied"
        message={`Your current workspace access does not allow this ${subject}. Nothing changed. Support reference: ${requestId}.`}
        action={
          <ButtonLink href="/app/decks" variant="secondary">
            Back to decks
          </ButtonLink>
        }
      />
    );
  }
  return (
    <ErrorState
      title={`${subject.slice(0, 1).toUpperCase()}${subject.slice(1)} could not be loaded`}
      message={`Nothing changed. Retry safely or ask support to inspect request ${requestId}.`}
      action={
        <ButtonLink href={retryHref} variant="secondary">
          Retry
        </ButtonLink>
      }
    />
  );
}
