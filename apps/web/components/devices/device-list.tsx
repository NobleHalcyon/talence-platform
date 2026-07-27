import Link from "next/link";

import { EmptyState, Panel } from "@talence/ui";

import type { DeviceListPage, DeviceStatus } from "@/features/devices/types";

import { DeviceStatusBadge, deviceTypeLabel, formatDeviceInstant } from "./device-shared";
import styles from "./devices.module.css";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "revoked", label: "Revoked" },
] as const;

export function DeviceStatusNavigation({ status }: { status: DeviceStatus | "all" }) {
  return (
    <nav className={styles.statusNav} aria-label="Device status">
      {FILTERS.map((filter) => (
        <Link
          className={`${styles.statusLink} ${filter.value === status ? styles.statusLinkActive : ""}`}
          href={
            filter.value === "all" ? "/app/devices" : `/app/devices?status_filter=${filter.value}`
          }
          aria-current={filter.value === status ? "page" : undefined}
          key={filter.value}
        >
          {filter.label}
        </Link>
      ))}
    </nav>
  );
}

export function DeviceListView({
  page,
  status,
}: {
  page: DeviceListPage;
  status: DeviceStatus | "all";
}) {
  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <DeviceStatusNavigation status={status} />
        <p className={styles.meta}>
          {page.items.length} device{page.items.length === 1 ? "" : "s"} on this page
        </p>
      </div>
      {page.items.length === 0 ? (
        <EmptyState
          title={status === "all" ? "No registered devices" : `No ${status} devices`}
          message={
            page.permissions.canRegister
              ? "Register a machine below and store its one-time credential."
              : "No device in this workspace matches the selected lifecycle state."
          }
        />
      ) : (
        <ul className={styles.deviceGrid}>
          {page.items.map((device) => (
            <li key={device.id}>
              <Panel className={styles.deviceCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.deviceName}>
                      <Link className={styles.deviceNameLink} href={`/app/devices/${device.id}`}>
                        {device.name}
                      </Link>
                    </h2>
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
                    <dt>Catalog</dt>
                    <dd>{device.installedCatalogVersion ?? "Not reported"}</dd>
                  </div>
                  <div className={styles.metaRow}>
                    <dt>Client</dt>
                    <dd>{device.lastClientVersion ?? "Not reported"}</dd>
                  </div>
                </dl>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
