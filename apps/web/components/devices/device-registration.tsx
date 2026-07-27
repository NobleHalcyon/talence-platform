"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, Checkbox, FormField, InlineAlert, Panel, Select, TextInput } from "@talence/ui";

import { registerDeviceAction, rotateDeviceCredentialAction } from "@/features/devices/actions";
import type { DeviceCredentialActionState } from "@/features/devices/types";

import styles from "./devices.module.css";

const INITIAL_STATE: DeviceCredentialActionState = { status: "idle" };

function CredentialAcknowledgement({
  state,
  onDone,
}: {
  state: Extract<DeviceCredentialActionState, { status: "issued" }>;
  onDone: () => void;
}) {
  const [stored, setStored] = useState(false);
  return (
    <Panel className={styles.secretPanel} aria-label="One-time device credential">
      <InlineAlert title="Store this credential now" tone="warning">
        This raw credential is displayed once. Talence stores only its non-secret prefix and
        HMAC-SHA-256 digest, so it cannot be recovered later.
      </InlineAlert>
      <code className={styles.secret} aria-label="Raw device credential">
        {state.credential}
      </code>
      <p className={styles.hint}>
        Credential prefix: <span className={styles.prefix}>{state.prefix}</span>
      </p>
      <Checkbox
        label="I stored this credential in the device's secret storage."
        checked={stored}
        onChange={(event) => setStored(event.currentTarget.checked)}
      />
      <Button disabled={!stored} onClick={onDone}>
        I have stored it
      </Button>
    </Panel>
  );
}

export function DeviceRegistrationForm({
  workspaceId,
  disabled = false,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(registerDeviceAction, INITIAL_STATE);
  const [acknowledged, setAcknowledged] = useState(false);
  if (state.status === "issued" && !acknowledged) {
    return <CredentialAcknowledgement state={state} onDone={() => setAcknowledged(true)} />;
  }
  if (state.status === "issued" && acknowledged) {
    return (
      <InlineAlert title="Credential acknowledged" tone="success">
        The raw value is no longer displayed.{" "}
        <Link href={`/app/devices/${state.deviceId}`}>Open {state.deviceName}</Link> to configure
        grants.
      </InlineAlert>
    );
  }
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {state.status === "error" ? (
        <InlineAlert title="Device registration failed" tone="danger">
          {state.message} Nothing changed. Support reference: {state.requestId}.
        </InlineAlert>
      ) : null}
      <div className={styles.formGrid}>
        <FormField inputId="device-name" label="Device name">
          <TextInput name="name" required maxLength={120} autoComplete="off" />
        </FormField>
        <FormField inputId="device-type" label="Device type">
          <Select name="type" defaultValue="talence_sorter">
            <option value="talence_sorter">Talence sorter</option>
            <option value="scanner">Scanner</option>
            <option value="kiosk">Kiosk</option>
            <option value="third_party">Third party</option>
          </Select>
        </FormField>
        <FormField inputId="device-manufacturer" label="Manufacturer (optional)">
          <TextInput name="manufacturer" maxLength={120} autoComplete="off" />
        </FormField>
        <FormField inputId="device-model" label="Model (optional)">
          <TextInput name="model" maxLength={120} autoComplete="off" />
        </FormField>
        <FormField
          inputId="device-serial"
          label="Serial number (optional)"
          className={styles.fullField}
        >
          <TextInput name="serialNumber" maxLength={160} autoComplete="off" />
        </FormField>
      </div>
      <Button type="submit" busy={pending} disabled={disabled}>
        Register device and issue credential
      </Button>
    </form>
  );
}

export function DeviceCredentialRotation({
  deviceId,
  disabled = false,
}: {
  deviceId: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(rotateDeviceCredentialAction, INITIAL_STATE);
  const [acknowledged, setAcknowledged] = useState(false);
  if (state.status === "issued" && !acknowledged) {
    return <CredentialAcknowledgement state={state} onDone={() => setAcknowledged(true)} />;
  }
  if (state.status === "issued" && acknowledged) {
    return (
      <InlineAlert title="Rotated credential acknowledged" tone="success">
        The raw value is no longer displayed. Prior active credentials were revoked atomically.
      </InlineAlert>
    );
  }
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="deviceId" value={deviceId} />
      {state.status === "error" ? (
        <InlineAlert title="Credential rotation failed" tone="danger">
          {state.message} Nothing changed. Support reference: {state.requestId}.
        </InlineAlert>
      ) : null}
      <Button type="submit" busy={pending} disabled={disabled} variant="secondary">
        Rotate credential
      </Button>
    </form>
  );
}
