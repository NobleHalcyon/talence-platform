import type { ReactNode } from "react";
import Link from "next/link";

import { signOutAction } from "@/features/auth/actions";
import { setActiveWorkspaceAction } from "@/features/settings/actions";
import type { AppContext } from "@/lib/auth/app-context";
import { TalenceMark } from "@/components/brand/talence-mark";

import styles from "./app-shell.module.css";
import { BottomNavigation, DesktopNavigation } from "./primary-navigation";

export function AppShell({
  children,
  context,
  previewMode = false,
}: {
  children: ReactNode;
  context?: AppContext;
  previewMode?: boolean;
}) {
  const initials =
    context?.profile.display_name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase("en-US"))
      .join("") || "AC";

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <Link className={styles.brandLink} href="/app" aria-label="Talence dashboard">
          <TalenceMark compact />
        </Link>
        <DesktopNavigation />
        <div className={styles.accountGroup}>
          {context?.isPlatformAdmin ? (
            <Link className={styles.adminLink} href="/app/admin/invites">
              Admin
            </Link>
          ) : null}
          <Link
            className={styles.accountLink}
            href="/app/settings"
            aria-label="Account and settings"
          >
            {initials}
          </Link>
          {context ? (
            <form action={signOutAction}>
              <button className={styles.logoutButton} type="submit">
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      </header>
      {previewMode ? (
        <div className={styles.previewBanner} role="status">
          Static preview · Supabase is not configured
        </div>
      ) : null}
      <div className={styles.body}>
        <aside className={styles.contextRail} aria-label="Workspace context">
          <header className={styles.railHeader}>
            <p className={styles.railEyebrow}>Active workspace</p>
            <h2 className={styles.railTitle}>{context?.workspace.name ?? "Personal workspace"}</h2>
          </header>
          {context && context.workspaces.length > 1 ? (
            <form className={styles.workspaceForm} action={setActiveWorkspaceAction}>
              <label className={styles.workspaceLabel} htmlFor="shell-workspace">
                Switch workspace
              </label>
              <select
                className={styles.workspaceSelect}
                id="shell-workspace"
                name="workspaceId"
                defaultValue={context.workspace.id}
              >
                {context.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <button className={styles.workspaceButton} type="submit">
                Use workspace
              </button>
            </form>
          ) : (
            <ul className={styles.railList}>
              <li className={styles.railItem}>Workspace-scoped resources</li>
              <li className={styles.railItem}>Private visibility</li>
              <li className={styles.railItem}>Managed admission</li>
            </ul>
          )}
        </aside>
        <main className={styles.main} id="main-content">
          {children}
        </main>
      </div>
      <BottomNavigation />
    </div>
  );
}
