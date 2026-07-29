import { ButtonLink, ErrorState, InlineAlert, Tabs } from "@talence/ui";

import type { CollectionLoadFailureReason, CollectionRecord } from "@/features/collections/types";
import { safeRequestId } from "@/lib/auth/safe-status";

import styles from "./collections.module.css";

const STATUS_MESSAGES: Readonly<
  Record<
    string,
    { title: string; message: string; tone: "danger" | "information" | "success" | "warning" }
  >
> = {
  collection_created: {
    title: "Collection created",
    message: "The private collection is ready for exact-printing inventory.",
    tone: "success",
  },
  collection_updated: {
    title: "Collection updated",
    message: "The latest collection details are saved.",
    tone: "success",
  },
  collection_archived: {
    title: "Collection archived",
    message: "Inventory and immutable history remain available; restore it when needed.",
    tone: "success",
  },
  collection_restored: {
    title: "Collection restored",
    message: "The collection is active again.",
    tone: "success",
  },
  collection_deleted: {
    title: "Collection deleted",
    message: "The empty collection was soft-deleted. Its audit history was not rewritten.",
    tone: "success",
  },
  collection_not_empty: {
    title: "Collection still has inventory",
    message: "Move or remove positive balances before soft-deleting, or archive it instead.",
    tone: "warning",
  },
  default_collection_locked: {
    title: "Default collection is protected",
    message: "Choose a different default collection in Settings before this lifecycle change.",
    tone: "warning",
  },
  collection_invalid: {
    title: "Collection needs attention",
    message: "Check the name, description, cover printing, and current version before retrying.",
    tone: "danger",
  },
  inventory_added: {
    title: "Inventory added",
    message: "The exact printing change committed with immutable transaction history.",
    tone: "success",
  },
  inventory_updated: {
    title: "Inventory updated",
    message: "The quantity change committed atomically and current balances were reconciled.",
    tone: "success",
  },
  inventory_moved: {
    title: "Inventory moved",
    message: "Both collection legs committed as one paired transfer.",
    tone: "success",
  },
  inventory_reversed: {
    title: "Transaction reversed",
    message: "A compensating transaction was added; the original history remains unchanged.",
    tone: "success",
  },
  stale_quantity: {
    title: "Quantity changed elsewhere",
    message: "Nothing was applied. Reload the current quantity, review it, and retry explicitly.",
    tone: "warning",
  },
  inventory_invalid: {
    title: "Inventory change is invalid",
    message:
      "Nothing changed. Reload the current collection and submit a supported exact-printing change.",
    tone: "danger",
  },
  idempotency_conflict: {
    title: "Retry payload changed",
    message: "Nothing changed. Reload before starting a new attempt with different values.",
    tone: "warning",
  },
  negative_quantity: {
    title: "Quantity cannot become negative",
    message: "Nothing changed. Reload the current balance and reduce the removal amount.",
    tone: "warning",
  },
  unsupported_finish: {
    title: "Finish is unavailable",
    message: "Nothing changed. Choose a finish supported by every selected exact printing.",
    tone: "warning",
  },
  import_committed: {
    title: "Import committed",
    message: "Included matched rows were applied in one idempotent inventory transaction.",
    tone: "success",
  },
  import_ambiguity_unresolved: {
    title: "Ambiguity still needs review",
    message: "No inventory changed. Match or exclude every ambiguous row before confirming.",
    tone: "warning",
  },
  import_cancelled: {
    title: "Import cancelled",
    message: "No inventory changed. The staged job is terminal and will be purged by policy.",
    tone: "information",
  },
  mutation_failed: {
    title: "Change did not commit",
    message: "Nothing changed. Reload current state and retry; use the request ID for support.",
    tone: "danger",
  },
  access_denied: {
    title: "Permission denied",
    message: "Your current workspace role cannot make that change.",
    tone: "danger",
  },
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function CollectionReadErrorState({
  reason,
  requestId,
  subject,
  genericTitle,
  retryHref,
}: {
  reason: CollectionLoadFailureReason;
  requestId: string;
  subject: string;
  genericTitle: string;
  retryHref: string;
}) {
  const denied = reason === "permission_denied";
  return (
    <ErrorState
      title={denied ? "Permission denied" : genericTitle}
      message={
        denied
          ? `Your current workspace access does not allow this ${subject}. Nothing changed. Request ${requestId}.`
          : `Nothing changed. Retry safely or use request ${requestId} for support.`
      }
      action={
        <ButtonLink href={denied ? "/app/collections" : retryHref} variant="secondary">
          {denied ? "Back to collections" : "Retry"}
        </ButtonLink>
      }
    />
  );
}

export function CollectionStatusNotice({
  status,
  requestId,
}: {
  status?: string | string[];
  requestId?: string | string[];
}) {
  const message = STATUS_MESSAGES[first(status)];
  if (!message) return null;
  const safeId = safeRequestId(requestId);
  return (
    <InlineAlert title={message.title} tone={message.tone}>
      {message.message}
      {safeId ? ` Request ID: ${safeId}.` : ""}
    </InlineAlert>
  );
}

export function CollectionNavigation({
  collection,
  active,
}: {
  collection: CollectionRecord;
  active: "inventory" | "history" | "import";
}) {
  const base = `/app/collections/${collection.id}`;
  return (
    <Tabs
      label={`${collection.name} sections`}
      items={[
        { href: base, label: "Inventory", active: active === "inventory" },
        { href: `${base}/history`, label: "History", active: active === "history" },
        { href: `${base}/import`, label: "Import CSV", active: active === "import" },
      ]}
    />
  );
}

export function PreviewBadge() {
  return <span className={styles.previewBadge}>Deterministic preview data</span>;
}

export function formatInstant(value: string | null): string {
  if (!value) return "Unavailable";
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(instant);
}

export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "Price unavailable";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatPriceProviders(providers: readonly string[]): string {
  if (!providers.length) return "Source unavailable";
  const names = providers.map(label);
  return `${names.length === 1 ? "Source" : "Sources"}: ${names.join(", ")}`;
}
