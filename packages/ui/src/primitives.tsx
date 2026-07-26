import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cloneElement } from "react";

import { getPriceState, type PriceObservation } from "@talence/domain";

import styles from "./primitives.module.css";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "small" | "standard" | "large";

const buttonVariantClass: Record<ButtonVariant, string | undefined> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  quiet: styles.buttonQuiet,
  danger: styles.buttonDanger,
};

const buttonSizeClass: Record<ButtonSize, string | undefined> = {
  small: styles.buttonSmall,
  standard: undefined,
  large: styles.buttonLarge,
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}

export function Button({
  variant = "primary",
  size = "standard",
  busy = false,
  type = "button",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={classes(
        styles.button,
        buttonVariantClass[variant],
        buttonSizeClass[size],
        className,
      )}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      type={type}
      {...props}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Exclude<ButtonVariant, "danger">;
  size?: ButtonSize;
}

export function ButtonLink({
  variant = "primary",
  size = "standard",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={classes(
        styles.buttonLink,
        buttonVariantClass[variant],
        buttonSizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  label: string;
}

export function IconButton({
  label,
  type = "button",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={classes(styles.iconButton, className)}
      type={type}
      {...props}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes(styles.input, className)} {...props} />;
}

export function SearchInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <TextInput type="search" enterKeyHint="search" {...props} />;
}

export function NumberInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <TextInput type="number" inputMode="numeric" {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classes(styles.select, className)} {...props} />;
}

export interface FormFieldProps {
  children: ReactElement<FieldControlProps>;
  inputId: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
}

interface FieldControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "grammar" | "spelling" | "true";
}

export function FormField({ children, inputId, label, hint, error, className }: FormFieldProps) {
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId]
    .filter(Boolean)
    .join(" ");
  const controlProps: FieldControlProps = {
    id: inputId,
  };

  if (describedBy) {
    controlProps["aria-describedby"] = describedBy;
  }
  if (error) {
    controlProps["aria-invalid"] = true;
  }

  return (
    <div className={classes(styles.field, className)}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      {cloneElement(children, controlProps)}
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.validation} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <label className={styles.checkControl}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "information";

const statusClass: Record<StatusTone, string | undefined> = {
  neutral: undefined,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
  information: styles.badgeInformation,
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span className={classes(styles.badge, statusClass[tone], className)} {...props} />;
}

export const StatusBadge = Badge;

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes(styles.panel, className)} {...props} />;
}

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function Section({
  title,
  description,
  action,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={classes(styles.section, className)} {...props}>
      <header className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {description ? <p className={styles.sectionDescription}>{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const alertClass: Record<Exclude<StatusTone, "neutral">, string | undefined> = {
  information: undefined,
  success: styles.alertSuccess,
  warning: styles.alertWarning,
  danger: styles.alertDanger,
};

export interface InlineAlertProps {
  title: string;
  children: ReactNode;
  tone?: Exclude<StatusTone, "neutral">;
}

export function InlineAlert({ title, children, tone = "information" }: InlineAlertProps) {
  return (
    <div
      className={classes(styles.alert, alertClass[tone])}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div className={styles.alertText}>
        <p className={styles.alertTitle}>{title}</p>
        <p className={styles.alertMessage}>{children}</p>
      </div>
    </div>
  );
}

export interface StateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: StateProps) {
  return (
    <div className={styles.state}>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateMessage}>{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, message, action }: StateProps) {
  return (
    <div className={styles.state} role="alert">
      <StatusBadge tone="danger">Action needed</StatusBadge>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateMessage}>{message}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={classes(styles.skeleton, className)} aria-hidden="true" {...props} />;
}

export interface PriceDisplayProps {
  observation?: PriceObservation | null;
  now?: Date;
}

function formatMoney(amount: string, currency: string): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return amount;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatObservedAt(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(instant);
}

export function PriceDisplay({ observation, now }: PriceDisplayProps) {
  const state = getPriceState(observation, now);

  if (state.kind === "unavailable") {
    return <span className={styles.priceMeta}>Price unavailable</span>;
  }

  const observedLabel = formatObservedAt(state.observation.observedAt);

  return (
    <span className={styles.price}>
      <span className={styles.priceAmount}>
        {formatMoney(state.observation.amount, state.observation.currency)}
      </span>
      <span className={styles.priceMeta}>
        {state.observation.provider} estimate ·{" "}
        <time dateTime={state.observation.observedAt}>observed {observedLabel} UTC</time>
      </span>
      {state.stale ? <span className={styles.priceStale}>Estimate may be stale</span> : null}
    </span>
  );
}

export interface CursorControlsProps {
  previousHref?: string;
  nextHref?: string;
  label: string;
}

export function CursorControls({ previousHref, nextHref, label }: CursorControlsProps) {
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      {previousHref ? (
        <ButtonLink href={previousHref} variant="secondary" size="small">
          Previous
        </ButtonLink>
      ) : (
        <span />
      )}
      <span className={styles.paginationStatus}>{label}</span>
      {nextHref ? (
        <ButtonLink href={nextHref} variant="secondary" size="small">
          Next
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}

export const Pagination = CursorControls;

export interface TabItem {
  href: string;
  label: string;
  active?: boolean;
}

export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {items.map((item) => (
        <a
          key={item.href}
          className={classes(styles.tab, item.active && styles.tabActive)}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function VisuallyHidden({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={classes(styles.visuallyHidden, className)} {...props} />;
}
