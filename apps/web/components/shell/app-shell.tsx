import type { ReactNode } from "react";
import Link from "next/link";

import { TalenceMark } from "@/components/brand/talence-mark";

import styles from "./app-shell.module.css";
import { BottomNavigation, DesktopNavigation } from "./primary-navigation";

export function AppShell({
  children,
  previewMode = false,
}: {
  children: ReactNode;
  previewMode?: boolean;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <Link className={styles.brandLink} href="/app" aria-label="Talence dashboard">
          <TalenceMark compact />
        </Link>
        <DesktopNavigation />
        <Link className={styles.accountLink} href="/app/settings" aria-label="Account and settings">
          AC
        </Link>
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
            <h2 className={styles.railTitle}>Personal workspace</h2>
          </header>
          <ul className={styles.railList}>
            <li className={styles.railItem}>Workspace-scoped resources</li>
            <li className={styles.railItem}>Private visibility</li>
            <li className={styles.railItem}>Managed admission</li>
          </ul>
        </aside>
        <main className={styles.main} id="main-content">
          {children}
        </main>
      </div>
      <BottomNavigation />
    </div>
  );
}
