"use client";

import { useRef, useState } from "react";

import { Badge, Button, ConfirmDialog, TextInput } from "@talence/ui";

import { useOptionalWorkspaceContext } from "@/components/workspace/workspace-context";
import { reverseInventoryAction } from "@/features/collections/actions";
import type { InventoryTransaction } from "@/features/collections/types";
import { canEditWorkspace } from "@/features/collections/view-model";

import styles from "./collections.module.css";

export function ReversalControl({
  collectionId,
  transaction,
  occurredAt,
  collectionStatus,
}: {
  collectionId: string;
  transaction: InventoryTransaction;
  occurredAt: string;
  collectionStatus: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const context = useOptionalWorkspaceContext();
  const canReverse =
    collectionStatus === "active" && (context === null || canEditWorkspace(context.workspace.role));
  const paired = Boolean(transaction.transferGroupId || transaction.pairedTransactionId);
  if (!canReverse) {
    return <Badge>Read-only history</Badge>;
  }
  return (
    <>
      <form ref={formRef} className={styles.reversalForm} action={reverseInventoryAction}>
        <input type="hidden" name="collectionId" value={collectionId} />
        <input type="hidden" name="transactionId" value={transaction.id} />
        <input type="hidden" name="idempotencyKey" value={`inventory-reversal:${transaction.id}`} />
        <input type="hidden" name="occurredAt" value={occurredAt} />
        <TextInput
          name="note"
          maxLength={1_000}
          placeholder="Optional reversal reason"
          aria-label="Reversal reason"
        />
        <Button
          size="small"
          variant="danger"
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          Reverse transaction
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={paired ? "Reverse the full transfer pair?" : "Create compensating reversal?"}
        description={
          paired
            ? "Both transfer headers and every line reverse atomically. A partial transfer reversal is not allowed."
            : "The original transaction remains immutable and a new opposite transaction is committed."
        }
        confirmLabel={paired ? "Reverse full pair" : "Create reversal"}
        dangerous
      >
        <p>Reversal is allowed once. Talence does not permit a reversal of a reversal.</p>
      </ConfirmDialog>
    </>
  );
}
