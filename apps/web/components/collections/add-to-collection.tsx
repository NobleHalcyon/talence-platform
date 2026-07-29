"use client";

import { useState } from "react";

import {
  Button,
  ButtonLink,
  Dialog,
  FormField,
  QuantityStepper,
  Select,
  TextInput,
} from "@talence/ui";

import { useOptionalWorkspaceContext } from "@/components/workspace/workspace-context";
import { applyInventoryAction } from "@/features/collections/actions";
import { PREVIEW_COLLECTION_ID } from "@/features/collections/preview-constants";
import { canEditWorkspace } from "@/features/collections/view-model";

import styles from "./collections.module.css";

export function AddToCollection({
  printingId,
  name,
  finishes,
  attemptId,
  occurredAt,
  compact = false,
}: {
  printingId: string;
  name: string;
  finishes: string[];
  attemptId: string;
  occurredAt: string;
  compact?: boolean;
}) {
  const context = useOptionalWorkspaceContext();
  const collections =
    context === null
      ? [{ id: PREVIEW_COLLECTION_ID, name: "Main Collection", slug: "main-collection" }]
      : context.collections;
  const supportedFinishes = finishes.filter(
    (finish) => finish === "nonfoil" || finish === "foil" || finish === "etched",
  );
  const [open, setOpen] = useState(false);
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);

  if (context !== null && !canEditWorkspace(context.workspace.role)) {
    return (
      <Button size={compact ? "small" : "standard"} variant="secondary" disabled>
        View-only access
      </Button>
    );
  }

  if (context !== null && collections.length === 0) {
    return (
      <ButtonLink href="/app/collections" size={compact ? "small" : "standard"} variant="secondary">
        Create collection first
      </ButtonLink>
    );
  }

  return (
    <>
      <Button
        size={compact ? "small" : "standard"}
        variant={compact ? "secondary" : "primary"}
        onClick={() => setOpen(true)}
        disabled={!collections.length || !supportedFinishes.length}
      >
        Add to collection
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Add ${name}`}
        description="Choose the exact collection, printing finish, condition, and additive quantity."
      >
        <form className={styles.formStack} action={applyInventoryAction}>
          <input type="hidden" name="collectionId" value={collectionId} />
          <input type="hidden" name="printingId" value={printingId} />
          <input type="hidden" name="quantityDelta" value={quantity} />
          <input type="hidden" name="lineId" value={`catalog-add:${attemptId}`} />
          <input type="hidden" name="idempotencyKey" value={`catalog-inventory-add:${attemptId}`} />
          <input type="hidden" name="occurredAt" value={occurredAt} />
          <input type="hidden" name="returnTo" value={`/app/collections/${collectionId}`} />
          <input type="hidden" name="surface" value="catalog_exact_printing" />
          <input type="hidden" name="externalReference" value={`catalog:${printingId}`} />
          <FormField inputId={`add-collection-${attemptId}`} label="Collection">
            <Select
              value={collectionId}
              onChange={(event) => setCollectionId(event.currentTarget.value)}
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField inputId={`add-finish-${attemptId}`} label="Finish">
            <Select name="finish" defaultValue={supportedFinishes[0]}>
              {supportedFinishes.map((finish) => (
                <option key={finish} value={finish}>
                  {finish === "nonfoil" ? "Nonfoil" : finish[0]!.toUpperCase() + finish.slice(1)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField inputId={`add-condition-${attemptId}`} label="Condition">
            <Select name="condition" defaultValue="near_mint">
              <option value="near_mint">Near mint</option>
              <option value="lightly_played">Lightly played</option>
              <option value="moderately_played">Moderately played</option>
              <option value="heavily_played">Heavily played</option>
              <option value="damaged">Damaged</option>
            </Select>
          </FormField>
          <div>
            <span className={styles.metricLabel}>Quantity</span>
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={10_000}
              label={`${name} quantity to add`}
            />
          </div>
          <FormField
            inputId={`add-note-${attemptId}`}
            label="Transaction note"
            hint="Optional plain-text note on the immutable transaction."
          >
            <TextInput name="note" maxLength={1_000} />
          </FormField>
          <Button type="submit">Commit additive transaction</Button>
        </form>
      </Dialog>
    </>
  );
}
