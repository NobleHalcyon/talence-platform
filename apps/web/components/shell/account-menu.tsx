"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { signOutAction } from "@/features/auth/actions";
import { setActiveWorkspaceAction } from "@/features/settings/actions";

import styles from "./app-shell.module.css";

interface AccountWorkspace {
  id: string;
  name: string;
}

function LogoutIcon() {
  return (
    <svg className={styles.logoutIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 4H5v16h5v-2H7V6h3V4Zm7.6 3.4-1.4 1.4 2.2 2.2H10v2h8.4l-2.2 2.2 1.4 1.4L22 12l-4.4-4.6Z" />
    </svg>
  );
}

export function AccountMenu({
  initials,
  isPlatformAdmin,
  profileName,
  currentWorkspaceId,
  workspaces,
  signedIn,
}: {
  initials: string;
  isPlatformAdmin: boolean;
  profileName: string | null;
  currentWorkspaceId: string | null;
  workspaces: AccountWorkspace[];
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.accountMenuRoot} ref={rootRef}>
      <button
        className={styles.accountButton}
        type="button"
        ref={buttonRef}
        aria-label={`Open account menu${profileName ? ` for ${profileName}` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((current) => !current)}
      >
        {initials}
      </button>

      {open ? (
        <div
          className={styles.accountPopover}
          id={popoverId}
          role="dialog"
          aria-label="Account menu"
        >
          <div className={styles.workspaceSelector}>
            <label className={styles.workspaceLabel} htmlFor={`${popoverId}-workspace`}>
              Workspace
            </label>
            {signedIn && currentWorkspaceId && workspaces.length > 0 ? (
              <form action={setActiveWorkspaceAction}>
                <select
                  className={styles.workspaceSelect}
                  id={`${popoverId}-workspace`}
                  name="workspaceId"
                  defaultValue={currentWorkspaceId}
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                >
                  {workspaces.map((workspace) => (
                    <option value={workspace.id} key={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </form>
            ) : (
              <span className={styles.workspaceUnavailable}>Preview workspace</span>
            )}
          </div>

          <Link
            className={styles.accountMenuLink}
            href="/app/devices"
            onClick={() => setOpen(false)}
          >
            Devices
          </Link>
          {isPlatformAdmin ? (
            <Link
              className={styles.accountMenuLink}
              href="/app/admin/invites"
              onClick={() => setOpen(false)}
            >
              Admin
            </Link>
          ) : null}
          <Link
            className={styles.accountMenuLink}
            href="/app/settings"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          {signedIn ? (
            <form className={styles.logoutForm} action={signOutAction}>
              <button className={styles.accountMenuLogout} type="submit">
                <LogoutIcon />
                <span>Log Out</span>
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
