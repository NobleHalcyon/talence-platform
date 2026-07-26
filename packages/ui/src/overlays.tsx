"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  DialogHTMLAttributes,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
} from "react";
import { cloneElement, useEffect, useId, useRef, useState } from "react";

import { Button, IconButton, type StatusTone } from "./primitives";
import styles from "./primitives.module.css";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface DialogProps extends Omit<
  DialogHTMLAttributes<HTMLDialogElement>,
  "open" | "title"
> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  closeLabel?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  closeLabel = "Close dialog",
  className,
  children,
  ...props
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }

    if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  function dismiss() {
    onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      className={classes(styles.dialog, className)}
      {...props}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          dismiss();
        }
      }}
    >
      <div className={styles.dialogSurface}>
        <header className={styles.overlayHeader}>
          <div>
            <h2 className={styles.overlayTitle} id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className={styles.overlayDescription} id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label={closeLabel} onClick={dismiss}>
            <span aria-hidden="true">×</span>
          </IconButton>
        </header>
        <div className={styles.overlayBody}>{children}</div>
        {footer ? <footer className={styles.overlayFooter}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}

export interface ConfirmDialogProps extends Omit<
  DialogProps,
  "children" | "footer" | "onOpenChange"
> {
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  busy?: boolean;
}

export function ConfirmDialog({
  children,
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  dangerous = false,
  busy = false,
  ...props
}: ConfirmDialogProps) {
  return (
    <Dialog
      {...props}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={dangerous ? "danger" : "primary"} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

export type DrawerSide = "start" | "end" | "bottom";

export interface DrawerProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: DrawerSide;
  footer?: ReactNode;
  closeLabel?: string;
}

const drawerSideClass: Record<DrawerSide, string | undefined> = {
  start: styles.drawerStart,
  end: styles.drawerEnd,
  bottom: styles.drawerBottom,
};

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  side = "end",
  footer,
  closeLabel = "Close drawer",
  className,
  children,
  ...props
}: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab" || !drawer) {
        return;
      }

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const initialFocusTarget = drawer?.querySelector<HTMLElement>(
      "[autofocus], button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    (initialFocusTarget ?? drawer)?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.drawerBackdrop}
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div
        ref={drawerRef}
        className={classes(styles.drawer, drawerSideClass[side], className)}
        {...props}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className={styles.overlayHeader}>
          <div>
            <h2 className={styles.overlayTitle} id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className={styles.overlayDescription} id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label={closeLabel} onClick={() => onOpenChange(false)}>
            <span aria-hidden="true">×</span>
          </IconButton>
        </header>
        <div className={styles.overlayBody}>{children}</div>
        {footer ? <footer className={styles.overlayFooter}>{footer}</footer> : null}
      </div>
    </div>
  );
}

export const Sheet = Drawer;

export interface DropdownMenuProps {
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}

export function DropdownMenu({ label, children, align = "start" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function dismissOnOutsideInteraction(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", dismissOnOutsideInteraction);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsideInteraction);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.dropdown} ref={rootRef}>
      <Button
        variant="secondary"
        size="small"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </Button>
      <div
        className={classes(styles.dropdownMenu, align === "end" && styles.dropdownMenuEnd)}
        id={menuId}
        role="menu"
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}

export function DropdownMenuItem({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={classes(styles.dropdownItem, className)}
      type={type}
      {...props}
      role="menuitem"
    />
  );
}

export function DropdownMenuLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={classes(styles.dropdownItem, className)} {...props} role="menuitem" />;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<TooltipTriggerProps>;
}

interface TooltipTriggerProps {
  "aria-describedby"?: string;
}

export function Tooltip({ content, children }: TooltipProps) {
  const tooltipId = useId();
  const describedBy = [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ");

  return (
    <span className={styles.tooltipTrigger}>
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span className={styles.tooltip} id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}

const toastToneClass: Record<StatusTone, string | undefined> = {
  neutral: undefined,
  information: styles.toastInformation,
  success: styles.toastSuccess,
  warning: styles.toastWarning,
  danger: styles.toastDanger,
};

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  tone?: StatusTone;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function Toast({
  title,
  tone = "neutral",
  onDismiss,
  dismissLabel = "Dismiss notification",
  className,
  children,
  ...props
}: ToastProps) {
  return (
    <div
      className={classes(styles.toast, toastToneClass[tone], className)}
      {...props}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div>
        <p className={styles.toastTitle}>{title}</p>
        {children ? <div className={styles.toastMessage}>{children}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton label={dismissLabel} onClick={onDismiss}>
          <span aria-hidden="true">×</span>
        </IconButton>
      ) : null}
    </div>
  );
}

export function ToastRegion({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes(styles.toastRegion, className)} aria-label="Notifications" {...props} />
  );
}

export interface FilterDrawerProps extends Omit<DrawerProps, "closeLabel" | "side" | "title"> {
  title?: string;
}

export function FilterDrawer({ title = "Filters", ...props }: FilterDrawerProps) {
  return <Drawer {...props} title={title} closeLabel="Close filters" side="end" />;
}
