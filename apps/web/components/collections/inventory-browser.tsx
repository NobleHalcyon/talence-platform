"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  Badge,
  Button,
  CardImage,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PriceDisplay,
  QuantityStepper,
  Select,
  StatusBadge,
  TextInput,
} from "@talence/ui";

import {
  applyInventoryAction,
  bulkInventoryAction,
  type InventoryLineInput,
  type TransferLineInput,
} from "@/features/collections/actions";
import { useOptionalWorkspaceContext } from "@/components/workspace/workspace-context";
import type {
  CollectionListItem,
  CollectionView,
  InventoryBalanceItem,
} from "@/features/collections/types";
import {
  bulkAttemptIdempotencyKey,
  inventoryEditAttempt,
} from "@/features/collections/idempotency";
import {
  balanceSelectionKey,
  collectionMoveDestinations,
  type CollectionMoveDestination,
} from "@/features/collections/view-model";

import { formatInstant, formatMoney, label } from "./collection-shared";
import styles from "./collections.module.css";

function QuantityEditor({
  item,
  returnTo,
  occurredAt,
  canMutate,
}: {
  item: InventoryBalanceItem;
  returnTo: string;
  occurredAt: string;
  canMutate: boolean;
}) {
  const [quantity, setQuantity] = useState(item.quantity);
  const attempt = inventoryEditAttempt(item);
  if (!canMutate) {
    return <span>{item.quantity.toLocaleString("en-US")}</span>;
  }
  const delta = quantity - item.quantity;
  return (
    <form className={styles.quantityEditor} action={applyInventoryAction}>
      <input type="hidden" name="collectionId" value={item.collectionId} />
      <input type="hidden" name="printingId" value={item.printing.printingId} />
      <input type="hidden" name="finish" value={item.finish} />
      <input type="hidden" name="condition" value={item.condition} />
      <input type="hidden" name="quantityDelta" value={delta} />
      <input type="hidden" name="expectedQuantityBefore" value={item.quantity} />
      <input type="hidden" name="lineId" value={attempt.lineId} />
      <input type="hidden" name="idempotencyKey" value={attempt.idempotencyKey} />
      <input type="hidden" name="occurredAt" value={occurredAt} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="surface" value="collection_quantity" />
      <QuantityStepper
        value={quantity}
        onChange={setQuantity}
        min={0}
        max={10_000}
        label={`${item.printing.name} quantity`}
      />
      <Button type="submit" size="small" variant="secondary" disabled={delta === 0}>
        Save
      </Button>
    </form>
  );
}

function PriceCell({ item }: { item: InventoryBalanceItem }) {
  return (
    <div className={styles.priceCell}>
      <PriceDisplay observation={item.price.unit} />
      <span className={styles.totalEstimate}>
        Total{" "}
        {item.price.total
          ? formatMoney(item.price.total.amount, item.price.total.currency)
          : "unpriced"}
      </span>
    </div>
  );
}

function InventoryIdentity({
  item,
  imageClass,
}: {
  item: InventoryBalanceItem;
  imageClass: string;
}) {
  return (
    <div className={styles.inventoryIdentity}>
      <CardImage
        className={imageClass}
        src={item.printing.imageNormalUri ?? item.printing.imageSmallUri}
        alt={`${item.printing.name} card image`}
        fallbackLabel={`${item.printing.name} image unavailable`}
      />
      <div>
        <Link
          className={styles.primaryLink}
          href={`/app/catalog/printings/${item.printing.printingId}?from=${encodeURIComponent(
            `/app/collections/${item.collectionId}`,
          )}`}
        >
          {item.printing.name}
        </Link>
        {item.printing.printedName && item.printing.printedName !== item.printing.name ? (
          <span className={styles.secondaryText}>{item.printing.printedName}</span>
        ) : null}
        <span className={styles.secondaryText}>
          {item.printing.setCode} #{item.printing.collectorNumber} ·{" "}
          {item.printing.language.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function StructuredInventory({
  items,
  selected,
  toggle,
  returnTo,
  occurredAt,
  canMutate,
}: {
  items: InventoryBalanceItem[];
  selected: Set<string>;
  toggle: (item: InventoryBalanceItem, checked: boolean) => void;
  returnTo: string;
  occurredAt: string;
  canMutate: boolean;
}) {
  return (
    <DataTable className={styles.inventoryTableRegion} label="Collection inventory">
      <table className={styles.inventoryTable}>
        <thead>
          <tr>
            <th scope="col">
              <span className={styles.visuallyHidden}>Select</span>
            </th>
            <th scope="col">Card</th>
            <th scope="col">Finish</th>
            <th scope="col">Condition</th>
            <th scope="col">Quantity</th>
            <th scope="col">Estimate</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const key = balanceSelectionKey(item);
            return (
              <tr key={key}>
                <td data-label="Select">
                  <Checkbox
                    label={`Select ${item.printing.name}, ${label(item.finish)}, ${label(
                      item.condition,
                    )}`}
                    checked={selected.has(key)}
                    disabled={!canMutate}
                    onChange={(event) => toggle(item, event.currentTarget.checked)}
                  />
                </td>
                <td data-label="Card">
                  <InventoryIdentity item={item} imageClass={styles.tableCardImage} />
                </td>
                <td data-label="Finish">
                  <Badge>{label(item.finish)}</Badge>
                </td>
                <td data-label="Condition">
                  <Badge>{label(item.condition)}</Badge>
                </td>
                <td data-label="Quantity">
                  <QuantityEditor
                    item={item}
                    returnTo={returnTo}
                    occurredAt={occurredAt}
                    canMutate={canMutate}
                  />
                </td>
                <td data-label="Estimate">
                  <PriceCell item={item} />
                </td>
                <td data-label="Updated">
                  <time dateTime={item.updatedAt}>{formatInstant(item.updatedAt)} UTC</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTable>
  );
}

function GalleryInventory({
  items,
  selected,
  toggle,
  returnTo,
  occurredAt,
  canMutate,
}: {
  items: InventoryBalanceItem[];
  selected: Set<string>;
  toggle: (item: InventoryBalanceItem, checked: boolean) => void;
  returnTo: string;
  occurredAt: string;
  canMutate: boolean;
}) {
  return (
    <div className={styles.inventoryGallery} aria-label="Collection inventory gallery">
      {items.map((item) => {
        const key = balanceSelectionKey(item);
        return (
          <article className={styles.inventoryCard} key={key}>
            <div className={styles.inventoryCardSelect}>
              <Checkbox
                label={`Select ${item.printing.name}, ${label(item.finish)}, ${label(
                  item.condition,
                )}`}
                checked={selected.has(key)}
                disabled={!canMutate}
                onChange={(event) => toggle(item, event.currentTarget.checked)}
              />
            </div>
            <CardImage
              className={styles.galleryCardImage}
              src={item.printing.imageNormalUri ?? item.printing.imageSmallUri}
              alt={`${item.printing.name} card image`}
            />
            <div className={styles.inventoryCardBody}>
              <h2>
                <Link href={`/app/catalog/printings/${item.printing.printingId}`}>
                  {item.printing.name}
                </Link>
              </h2>
              <p>
                {item.printing.setCode} #{item.printing.collectorNumber} ·{" "}
                {item.printing.language.toUpperCase()}
              </p>
              <div className={styles.badgeRow}>
                <Badge>{label(item.finish)}</Badge>
                <Badge>{label(item.condition)}</Badge>
                <StatusBadge tone="information">Qty {item.quantity}</StatusBadge>
              </div>
              <PriceCell item={item} />
              <QuantityEditor
                item={item}
                returnTo={returnTo}
                occurredAt={occurredAt}
                canMutate={canMutate}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function buildMutationLines(
  selectedItems: InventoryBalanceItem[],
  operation: string,
  targetFinish: string,
  targetCondition: string,
): InventoryLineInput[] {
  return selectedItems.flatMap((item, index) => {
    if (operation === "remove") {
      return [
        {
          lineId: `remove-${index}-${item.printing.printingId}`,
          printingId: item.printing.printingId,
          finish: item.finish as InventoryLineInput["finish"],
          condition: item.condition as InventoryLineInput["condition"],
          quantityDelta: -item.quantity,
          expectedQuantityBefore: item.quantity,
        },
      ];
    }
    if (operation === "condition" && targetCondition && targetCondition !== item.condition) {
      return [
        {
          lineId: `condition-out-${index}-${item.printing.printingId}`,
          printingId: item.printing.printingId,
          finish: item.finish as InventoryLineInput["finish"],
          condition: item.condition as InventoryLineInput["condition"],
          quantityDelta: -item.quantity,
          expectedQuantityBefore: item.quantity,
        },
        {
          lineId: `condition-in-${index}-${item.printing.printingId}`,
          printingId: item.printing.printingId,
          finish: item.finish as InventoryLineInput["finish"],
          condition: targetCondition as InventoryLineInput["condition"],
          quantityDelta: item.quantity,
        },
      ];
    }
    if (operation === "finish" && targetFinish && targetFinish !== item.finish) {
      return [
        {
          lineId: `finish-out-${index}-${item.printing.printingId}`,
          printingId: item.printing.printingId,
          finish: item.finish as InventoryLineInput["finish"],
          condition: item.condition as InventoryLineInput["condition"],
          quantityDelta: -item.quantity,
          expectedQuantityBefore: item.quantity,
        },
        {
          lineId: `finish-in-${index}-${item.printing.printingId}`,
          printingId: item.printing.printingId,
          finish: targetFinish as InventoryLineInput["finish"],
          condition: item.condition as InventoryLineInput["condition"],
          quantityDelta: item.quantity,
        },
      ];
    }
    return [];
  });
}

function buildTransferLines(selectedItems: InventoryBalanceItem[]): TransferLineInput[] {
  return selectedItems.map((item, index) => ({
    lineId: `move-${index}-${item.printing.printingId}`,
    printingId: item.printing.printingId,
    finish: item.finish as TransferLineInput["finish"],
    condition: item.condition as TransferLineInput["condition"],
    quantity: item.quantity,
    expectedSourceQuantityBefore: item.quantity,
  }));
}

function BulkControls({
  collectionId,
  selectedItems,
  collections,
  returnTo,
  occurredAt,
  clear,
}: {
  collectionId: string;
  selectedItems: InventoryBalanceItem[];
  collections: CollectionMoveDestination[];
  returnTo: string;
  occurredAt: string;
  clear: () => void;
}) {
  const [operation, setOperation] = useState("condition");
  const [targetCondition, setTargetCondition] = useState("near_mint");
  const [targetFinish, setTargetFinish] = useState("nonfoil");
  const [destinationCollectionId, setDestinationCollectionId] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const moveLines = buildTransferLines(selectedItems);
  const mutationLines = buildMutationLines(selectedItems, operation, targetFinish, targetCondition);
  const finishSupported =
    operation !== "finish" ||
    selectedItems.every((item) =>
      item.printing.availableFinishes.includes(targetFinish as InventoryBalanceItem["finish"]),
    );
  const canSubmit =
    selectedItems.length > 0 &&
    finishSupported &&
    (operation === "move"
      ? Boolean(destinationCollectionId && moveLines.length)
      : mutationLines.length > 0);
  const serializedLines = JSON.stringify(operation === "move" ? moveLines : mutationLines);
  const idempotencyKey = bulkAttemptIdempotencyKey({
    collectionId,
    destinationCollectionId,
    operation,
    occurredAt,
    note,
    lines: serializedLines,
    selected: selectedItems.map((item) => ({
      printingId: item.printing.printingId,
      finish: item.finish,
      condition: item.condition,
      lastTransactionId: item.lastTransactionId,
    })),
  });
  const confirmation =
    operation === "move"
      ? `Move all quantities for ${selectedItems.length} selected balances as one paired transfer?`
      : operation === "remove"
        ? `Remove all quantities for ${selectedItems.length} selected balances?`
        : `Apply this ${operation} change to ${selectedItems.length} selected balances atomically?`;

  return (
    <aside className={styles.bulkBar} aria-label="Bulk inventory actions">
      <div>
        <strong>{selectedItems.length} selected</strong>
        <Button size="small" variant="quiet" onClick={clear}>
          Clear
        </Button>
      </div>
      <form ref={formRef} className={styles.bulkForm} action={bulkInventoryAction}>
        <input type="hidden" name="collectionId" value={collectionId} />
        <input type="hidden" name="operation" value={operation} />
        <input type="hidden" name="lines" value={serializedLines} />
        <input type="hidden" name="destinationCollectionId" value={destinationCollectionId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="occurredAt" value={occurredAt} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Select
          aria-label="Bulk operation"
          value={operation}
          onChange={(event) => setOperation(event.currentTarget.value)}
        >
          <option value="condition">Change condition</option>
          <option value="finish">Change finish</option>
          <option value="move">Move collection</option>
          <option value="remove">Remove all selected</option>
        </Select>
        {operation === "condition" ? (
          <Select
            aria-label="Target condition"
            value={targetCondition}
            onChange={(event) => setTargetCondition(event.currentTarget.value)}
          >
            <option value="near_mint">Near mint</option>
            <option value="lightly_played">Lightly played</option>
            <option value="moderately_played">Moderately played</option>
            <option value="heavily_played">Heavily played</option>
            <option value="damaged">Damaged</option>
          </Select>
        ) : null}
        {operation === "finish" ? (
          <Select
            aria-label="Target finish"
            value={targetFinish}
            onChange={(event) => setTargetFinish(event.currentTarget.value)}
          >
            <option value="nonfoil">Nonfoil</option>
            <option value="foil">Foil</option>
            <option value="etched">Etched</option>
          </Select>
        ) : null}
        {operation === "move" ? (
          <Select
            aria-label="Destination collection"
            required
            value={destinationCollectionId}
            onChange={(event) => setDestinationCollectionId(event.currentTarget.value)}
          >
            <option value="">Choose destination</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </Select>
        ) : null}
        <TextInput
          name="note"
          maxLength={1_000}
          placeholder="Optional transaction note"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        {!finishSupported ? (
          <span className={styles.bulkError} role="alert">
            At least one selected printing does not support that finish.
          </span>
        ) : null}
        <Button
          type="submit"
          variant={operation === "remove" ? "danger" : "primary"}
          disabled={!canSubmit}
          onClick={(event) => {
            if (selectedItems.length > 1 || operation === "remove") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          Apply bulk action
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        title="Confirm atomic bulk change"
        description={confirmation}
        confirmLabel="Apply change"
        dangerous={operation === "remove"}
      >
        <p>
          This creates immutable transaction lines. Transfers create paired headers and can only be
          reversed as a full pair.
        </p>
      </ConfirmDialog>
    </aside>
  );
}

export function InventoryBrowser({
  items,
  view,
  collections,
  collectionId,
  returnTo,
  occurredAt,
  canMutate,
}: {
  items: InventoryBalanceItem[];
  view: Exclude<CollectionView, "analytical">;
  collections: CollectionListItem[];
  collectionId: string;
  returnTo: string;
  occurredAt: string;
  canMutate: boolean;
}) {
  const workspaceContext = useOptionalWorkspaceContext();
  const destinations = collectionMoveDestinations(
    workspaceContext?.collections ?? null,
    collections,
    collectionId,
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(balanceSelectionKey(item))),
    [items, selected],
  );

  function toggle(item: InventoryBalanceItem, checked: boolean) {
    const key = balanceSelectionKey(item);
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  if (!items.length) {
    return (
      <EmptyState
        title="No balances match"
        message="Adjust the filters, browse the catalog to add an exact printing, or stage a CSV import."
        action={
          <Link className={styles.inlineLink} href="/app/catalog">
            Browse catalog
          </Link>
        }
      />
    );
  }

  return (
    <div className={styles.inventoryBrowser}>
      {canMutate ? (
        <div className={styles.selectionControls}>
          <Checkbox
            label="Select all visible balances"
            checked={selectedItems.length === items.length}
            onChange={(event) =>
              setSelected(
                event.currentTarget.checked ? new Set(items.map(balanceSelectionKey)) : new Set(),
              )
            }
          />
          <span>{selectedItems.length.toLocaleString()} selected</span>
        </div>
      ) : null}
      {view === "structured" ? (
        <StructuredInventory
          items={items}
          selected={selected}
          toggle={toggle}
          returnTo={returnTo}
          occurredAt={occurredAt}
          canMutate={canMutate}
        />
      ) : (
        <GalleryInventory
          items={items}
          selected={selected}
          toggle={toggle}
          returnTo={returnTo}
          occurredAt={occurredAt}
          canMutate={canMutate}
        />
      )}
      {canMutate && selectedItems.length ? (
        <BulkControls
          collectionId={collectionId}
          selectedItems={selectedItems}
          collections={destinations}
          returnTo={returnTo}
          occurredAt={occurredAt}
          clear={() => setSelected(new Set())}
        />
      ) : null}
    </div>
  );
}
