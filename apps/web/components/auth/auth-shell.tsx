import type { ReactNode } from "react";
import Link from "next/link";

import { InlineAlert } from "@talence/ui";

import { TalenceMark } from "@/components/brand/talence-mark";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import styles from "./auth-shell.module.css";

export interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  const configured = isSupabaseConfigured();

  return (
    <div className={styles.page}>
      <aside className={styles.context} aria-label="About Talence access">
        <div className={styles.contextInner}>
          <div className={styles.contextBrand}>
            <TalenceMark />
          </div>
          <div className={styles.contextCopy}>
            <p className={styles.contextEyebrow}>Private beta access</p>
            <p className={styles.contextTitle}>Precise tools begin with trusted identity.</p>
            <p className={styles.contextText}>
              Talence admits invited collectors through managed authentication, then scopes every
              mutable resource to a workspace.
            </p>
          </div>
          <p className={styles.contextFootnote}>
            No public registration · No anonymous catalog access
          </p>
        </div>
      </aside>
      <main className={styles.main} id="main-content">
        <div className={styles.mainInner}>
          <div className={styles.mobileBrand}>
            <TalenceMark />
          </div>
          <Link className={styles.backLink} href="/">
            ← Back to Talence
          </Link>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
          {!configured ? (
            <div className={styles.notice}>
              <InlineAlert title="Local preview mode" tone="information">
                Supabase browser configuration is not present. This shell stays available without
                attempting an authentication request.
              </InlineAlert>
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
