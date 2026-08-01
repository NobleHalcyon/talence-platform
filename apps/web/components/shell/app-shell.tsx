import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { TALENCE_EMBLEM_SRC } from "@/components/brand/brand-assets";
import type { AppContext } from "@/lib/auth/app-context";

import { AccountMenu } from "./account-menu";
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
        <Link className={styles.brandLink} href="/app" aria-label="Talence home">
          <Image
            className={styles.brandEmblem}
            src={TALENCE_EMBLEM_SRC}
            width={602}
            height={608}
            priority
            alt=""
          />
        </Link>
        <DesktopNavigation />
        <div className={styles.accountGroup}>
          <AccountMenu
            initials={initials}
            isPlatformAdmin={context?.isPlatformAdmin ?? false}
            profileName={context?.profile.display_name ?? context?.profile.handle ?? null}
            currentWorkspaceId={context?.workspace.id ?? null}
            workspaces={context?.workspaces ?? []}
            signedIn={Boolean(context)}
          />
        </div>
      </header>
      {previewMode ? (
        <div className={styles.previewBanner} role="status">
          Static preview · Supabase is not configured
        </div>
      ) : null}
      <div className={styles.body}>
        <main className={styles.main} id="main-content">
          {children}
        </main>
      </div>
      <BottomNavigation />
    </div>
  );
}
