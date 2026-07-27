"use client";

import { useRef, useState } from "react";

import { Button, ConfirmDialog } from "@talence/ui";

import { useOptionalWorkspaceContext } from "@/components/workspace/workspace-context";
import { collectionLifecycleAction } from "@/features/collections/actions";
import type { CollectionRecord } from "@/features/collections/types";
import { canEditWorkspace, canOwnWorkspace } from "@/features/collections/view-model";

export function CollectionLifecycleControl({
  collection,
  operation,
  disabled = false,
}: {
  collection: CollectionRecord;
  operation: "archive" | "restore" | "delete";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const context = useOptionalWorkspaceContext();
  const permissionDisabled =
    context !== null &&
    (operation === "delete"
      ? !canOwnWorkspace(context.workspace.role)
      : !canEditWorkspace(context.workspace.role));
  const labels = {
    archive: "Archive",
    restore: "Restore",
    delete: "Delete",
  };
  const descriptions = {
    archive:
      "Inventory and immutable history remain intact. A default collection must be changed in Settings first.",
    restore: "The collection becomes active and editable again.",
    delete: "Only an empty, non-default collection can be soft-deleted. Audit history is retained.",
  };

  return (
    <>
      <form ref={formRef} action={collectionLifecycleAction}>
        <input type="hidden" name="collectionId" value={collection.id} />
        <input type="hidden" name="expectedUpdatedAt" value={collection.updatedAt} />
        <input type="hidden" name="operation" value={operation} />
        <Button
          size="small"
          variant={operation === "delete" ? "danger" : "secondary"}
          disabled={disabled || permissionDisabled}
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
        title={`${labels[operation]} ${collection.name}?`}
        description={descriptions[operation]}
        confirmLabel={labels[operation]}
        dangerous={operation === "delete"}
      >
        <p>
          {operation === "delete"
            ? "This removes the collection from ordinary active views without editing any committed inventory history."
            : descriptions[operation]}
        </p>
      </ConfirmDialog>
    </>
  );
}
