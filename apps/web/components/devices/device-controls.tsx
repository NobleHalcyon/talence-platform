"use client";

import { useRef, useState } from "react";

import { Button, ConfirmDialog } from "@talence/ui";

import { deviceLifecycleAction, revokeDeviceCredentialAction } from "@/features/devices/actions";
import type { DeviceCredentialSummary, DeviceRecord } from "@/features/devices/types";

export function DeviceLifecycleControl({
  device,
  operation,
  disabled = false,
}: {
  device: DeviceRecord;
  operation: "activate" | "suspend" | "revoke" | "delete";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const labels = {
    activate: "Activate",
    suspend: "Suspend",
    revoke: "Revoke device",
    delete: "Delete device",
  };
  const descriptions = {
    activate: "The device may authenticate again with an unrevoked credential.",
    suspend: "Every API operation will be denied until an owner or administrator activates it.",
    revoke:
      "This terminally revokes the device and every credential. It cannot be activated again.",
    delete: "The already-revoked device leaves ordinary views. Audit-linked records are retained.",
  };
  return (
    <>
      <form ref={formRef} action={deviceLifecycleAction}>
        <input type="hidden" name="deviceId" value={device.id} />
        <input type="hidden" name="expectedUpdatedAt" value={device.updatedAt} />
        <input type="hidden" name="operation" value={operation} />
        <Button
          size="small"
          variant={operation === "revoke" || operation === "delete" ? "danger" : "secondary"}
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
        title={`${labels[operation]} ${device.name}?`}
        description={descriptions[operation]}
        confirmLabel={labels[operation]}
        dangerous={operation === "revoke" || operation === "delete"}
      >
        <p>{descriptions[operation]}</p>
      </ConfirmDialog>
    </>
  );
}

export function CredentialRevokeControl({
  device,
  credential,
  disabled = false,
}: {
  device: DeviceRecord;
  credential: DeviceCredentialSummary;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={formRef} action={revokeDeviceCredentialAction}>
        <input type="hidden" name="deviceId" value={device.id} />
        <input type="hidden" name="credentialId" value={credential.id} />
        <Button
          size="small"
          variant="danger"
          disabled={disabled || !credential.isActive}
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          Revoke credential
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={`Revoke credential ${credential.prefix}?`}
        description="The raw credential can never authenticate again. This does not start, stop, or alter a robot run."
        confirmLabel="Revoke credential"
        dangerous
      >
        <p>Issue or rotate another credential first if the device must remain connected.</p>
      </ConfirmDialog>
    </>
  );
}
