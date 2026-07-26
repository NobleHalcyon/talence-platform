import type { ReactNode } from "react";

import { Badge, Panel } from "@talence/ui";

import styles from "./page-frame.module.css";

export interface PageFrameProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
  constrained?: boolean;
}

export function PageFrame({
  eyebrow,
  title,
  description,
  children,
  action,
  constrained = false,
}: PageFrameProps) {
  return (
    <div className={`${styles.frame} ${constrained ? styles.frameConstrained : ""}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

export interface RoutePlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
  foundation: string;
  resourceId?: string;
  constrained?: boolean;
}

export function RoutePlaceholder({
  eyebrow,
  title,
  description,
  foundation,
  resourceId,
  constrained,
}: RoutePlaceholderProps) {
  return (
    <PageFrame
      eyebrow={eyebrow}
      title={title}
      description={description}
      constrained={constrained}
      action={<Badge tone="information">Phase 0 shell</Badge>}
    >
      <div className={styles.placeholderGrid}>
        <Panel className={styles.foundation}>
          <span className={styles.foundationMark} aria-hidden="true" />
          <h2 className={styles.foundationTitle}>Foundation ready</h2>
          <p className={styles.foundationCopy}>{foundation}</p>
        </Panel>
        <Panel>
          <h2 className={styles.foundationTitle}>Route contract</h2>
          <ul className={styles.metaList}>
            <li>
              <Badge>Loading</Badge>
            </li>
            <li>
              <Badge>Empty</Badge>
            </li>
            <li>
              <Badge>Error</Badge>
            </li>
            <li>
              <Badge>Denied</Badge>
            </li>
          </ul>
          {resourceId ? (
            <p className={styles.foundationCopy}>
              Resource reference: <code>{resourceId}</code>
            </p>
          ) : null}
        </Panel>
      </div>
    </PageFrame>
  );
}
