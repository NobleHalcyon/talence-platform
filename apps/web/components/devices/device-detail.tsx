import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  FormField,
  InlineAlert,
  Panel,
  Section,
  Select,
  TextInput,
} from "@talence/ui";

import { replaceDeviceGrantsAction, updateDeviceAction } from "@/features/devices/actions";
import {
  DEVICE_GRANT_PERMISSIONS,
  type DeviceDetail,
  type DeviceGrantPermission,
} from "@/features/devices/types";

import { CredentialRevokeControl, DeviceLifecycleControl } from "./device-controls";
import { DeviceCredentialRotation } from "./device-registration";
import { DeviceStatusBadge, deviceTypeLabel, formatDeviceInstant } from "./device-shared";
import styles from "./devices.module.css";

const PERMISSION_LABELS: Record<DeviceGrantPermission, string> = {
  inventory_read: "Inventory read",
  inventory_write: "Inventory write",
  run_summary_write: "Run summaries",
};

function DeviceIdentity({ detail }: { detail: DeviceDetail }) {
  const { device } = detail;
  return (
    <Panel>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.deviceName}>{device.name}</h2>
          <p className={styles.muted}>{deviceTypeLabel(device.type)}</p>
        </div>
        <DeviceStatusBadge status={device.status} />
      </div>
      <dl className={styles.metaList}>
        <div className={styles.metaRow}>
          <dt>Last seen</dt>
          <dd>{formatDeviceInstant(device.lastSeenAt)} UTC</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Installed catalog</dt>
          <dd>{device.installedCatalogVersion ?? "Not reported"}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Client software</dt>
          <dd>{device.lastClientVersion ?? "Not reported"}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Firmware</dt>
          <dd>{device.lastFirmwareVersion ?? "Not reported"}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Manufacturer / model</dt>
          <dd>
            {[device.manufacturer, device.model].filter(Boolean).join(" · ") || "Not supplied"}
          </dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Serial</dt>
          <dd>{device.serialNumber ?? "Not supplied"}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Device ID</dt>
          <dd>
            <code>{device.id}</code>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function DeviceUpdateForm({ detail }: { detail: DeviceDetail }) {
  const { device } = detail;
  const disabled = !detail.permissions.canManage || device.status === "revoked";
  return (
    <Section
      title="Identity"
      description="Human-facing registration fields. They never change hardware execution."
    >
      <form action={updateDeviceAction} className={styles.form}>
        <input type="hidden" name="deviceId" value={device.id} />
        <input type="hidden" name="expectedUpdatedAt" value={device.updatedAt} />
        <div className={styles.formGrid}>
          <FormField inputId="detail-device-name" label="Device name">
            <TextInput
              name="name"
              required
              maxLength={120}
              defaultValue={device.name}
              disabled={disabled}
            />
          </FormField>
          <FormField inputId="detail-device-type" label="Device type">
            <Select name="type" defaultValue={device.type} disabled={disabled}>
              <option value="talence_sorter">Talence sorter</option>
              <option value="scanner">Scanner</option>
              <option value="kiosk">Kiosk</option>
              <option value="third_party">Third party</option>
            </Select>
          </FormField>
          <FormField inputId="detail-device-manufacturer" label="Manufacturer (optional)">
            <TextInput
              name="manufacturer"
              maxLength={120}
              defaultValue={device.manufacturer ?? ""}
              disabled={disabled}
            />
          </FormField>
          <FormField inputId="detail-device-model" label="Model (optional)">
            <TextInput
              name="model"
              maxLength={120}
              defaultValue={device.model ?? ""}
              disabled={disabled}
            />
          </FormField>
          <FormField
            inputId="detail-device-serial"
            label="Serial number (optional)"
            className={styles.fullField}
          >
            <TextInput
              name="serialNumber"
              maxLength={160}
              defaultValue={device.serialNumber ?? ""}
              disabled={disabled}
            />
          </FormField>
        </div>
        <Button type="submit" disabled={disabled}>
          Save device
        </Button>
      </form>
    </Section>
  );
}

function CredentialList({ detail }: { detail: DeviceDetail }) {
  const activeCredentials = detail.credentials.filter((credential) => credential.isActive);
  return (
    <Section
      title="Credentials"
      description="Raw values are never stored or shown again after issuance."
      action={
        <Badge tone={activeCredentials.length ? "success" : "warning"}>
          {activeCredentials.length} active
        </Badge>
      }
    >
      {detail.credentials.length === 0 ? (
        <EmptyState
          title="No credential metadata"
          message="Rotate a credential to connect this registered device."
        />
      ) : (
        <ul className={styles.credentialList}>
          {detail.credentials.map((credential) => (
            <li className={styles.credential} key={credential.id}>
              <div className={styles.credentialHeader}>
                <div>
                  <strong className={styles.prefix}>{credential.prefix}</strong>
                  <p className={styles.meta}>
                    Created {formatDeviceInstant(credential.createdAt)} UTC · Last used{" "}
                    {formatDeviceInstant(credential.lastUsedAt)} UTC
                  </p>
                </div>
                <Badge tone={credential.isActive ? "success" : "danger"}>
                  {credential.isActive ? "active" : "revoked / expired"}
                </Badge>
              </div>
              {credential.isActive ? (
                <CredentialRevokeControl
                  device={detail.device}
                  credential={credential}
                  disabled={!detail.permissions.canManage}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {detail.device.status !== "revoked" ? (
        <DeviceCredentialRotation
          deviceId={detail.device.id}
          disabled={!detail.permissions.canManage}
        />
      ) : null}
    </Section>
  );
}

function GrantEditor({ detail }: { detail: DeviceDetail }) {
  const selected = new Set(
    detail.grants.flatMap((grant) =>
      grant.permissions.map((permission) => `${grant.collectionId}|${permission}`),
    ),
  );
  const disabled = !detail.permissions.canManage || detail.device.status === "revoked";
  return (
    <Section
      title="Collection grants"
      description="No device receives workspace-wide access. Every permission is explicit per collection."
    >
      {detail.availableCollections.length === 0 ? (
        <EmptyState
          title="No collections available"
          message="Create an active collection before granting device access."
        />
      ) : (
        <form action={replaceDeviceGrantsAction} className={styles.form}>
          <input type="hidden" name="deviceId" value={detail.device.id} />
          <div className={styles.grantMatrix}>
            {detail.availableCollections.map((collection) => (
              <div className={styles.grantRow} key={collection.id}>
                <div>
                  <strong>{collection.name}</strong>
                  {collection.status === "archived" ? (
                    <p className={styles.meta}>Archived · retained grant is visible</p>
                  ) : null}
                </div>
                {DEVICE_GRANT_PERMISSIONS.map((permission) => (
                  <Checkbox
                    key={permission}
                    name="grant"
                    value={`${collection.id}|${permission}`}
                    label={PERMISSION_LABELS[permission]}
                    defaultChecked={selected.has(`${collection.id}|${permission}`)}
                    disabled={disabled}
                  />
                ))}
              </div>
            ))}
          </div>
          <Button type="submit" disabled={disabled}>
            Save explicit grants
          </Button>
        </form>
      )}
    </Section>
  );
}

function Lifecycle({ detail }: { detail: DeviceDetail }) {
  const { device, permissions } = detail;
  return (
    <Section
      title="Lifecycle"
      description="Suspension is reversible. Device revocation is terminal and revokes every credential."
    >
      {!permissions.canManage ? (
        <InlineAlert title="Read-only device view" tone="warning">
          Only workspace owners and administrators may change device state or grants.
        </InlineAlert>
      ) : null}
      <div className={styles.actions}>
        {device.status === "active" ? (
          <DeviceLifecycleControl
            device={device}
            operation="suspend"
            disabled={!permissions.canManage}
          />
        ) : null}
        {device.status === "suspended" ? (
          <DeviceLifecycleControl
            device={device}
            operation="activate"
            disabled={!permissions.canManage}
          />
        ) : null}
        {device.status !== "revoked" ? (
          <DeviceLifecycleControl
            device={device}
            operation="revoke"
            disabled={!permissions.canManage}
          />
        ) : null}
        {device.status === "revoked" && !device.deletedAt ? (
          <DeviceLifecycleControl
            device={device}
            operation="delete"
            disabled={!permissions.canDelete}
          />
        ) : null}
      </div>
      <p className={styles.hint}>
        Talence exposes no remote start, movement command, or robot checkpoint control.
      </p>
    </Section>
  );
}

export function DeviceDetailView({ detail }: { detail: DeviceDetail }) {
  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailColumn}>
        <DeviceIdentity detail={detail} />
        <GrantEditor detail={detail} />
      </div>
      <div className={styles.detailColumn}>
        <DeviceUpdateForm detail={detail} />
        <CredentialList detail={detail} />
        <Lifecycle detail={detail} />
      </div>
    </div>
  );
}
