import type { HTMLAttributes, ReactNode } from "react";

import styles from "./primitives.module.css";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface DataTableProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  dense?: boolean;
}

/**
 * Adds a named, keyboard-scrollable region around semantic table markup. On
 * narrow viewports columns remain intact and can be inspected horizontally.
 */
export function DataTable({ label, dense = false, className, children, ...props }: DataTableProps) {
  return (
    <div
      className={classes(styles.dataTableRegion, dense && styles.dataTableDense, className)}
      {...props}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export interface FilterBarProps extends HTMLAttributes<HTMLElement> {
  label?: string;
  actions?: ReactNode;
}

export function FilterBar({
  label = "Filters",
  actions,
  className,
  children,
  ...props
}: FilterBarProps) {
  return (
    <section className={classes(styles.filterBar, className)} {...props} aria-label={label}>
      <div className={styles.filterFields}>{children}</div>
      {actions ? <div className={styles.filterActions}>{actions}</div> : null}
    </section>
  );
}
