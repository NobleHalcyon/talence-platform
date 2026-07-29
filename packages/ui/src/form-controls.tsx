"use client";

import type { FieldsetHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import styles from "./primitives.module.css";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface ComboboxOption {
  value: string;
  label?: string;
}

export interface ComboboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "list"
> {
  options: readonly ComboboxOption[];
  listId?: string;
}

/**
 * A progressively enhanced combobox backed by the platform's native datalist.
 * Feature code can replace its data source without recreating label, keyboard,
 * or autocomplete semantics.
 */
export function Combobox({
  options,
  listId,
  className,
  autoComplete = "off",
  ...props
}: ComboboxProps) {
  const generatedId = useId();
  const resolvedListId = listId ?? `combobox-${generatedId}`;

  return (
    <>
      <input
        className={classes(styles.input, className)}
        list={resolvedListId}
        autoComplete={autoComplete}
        aria-autocomplete="list"
        {...props}
      />
      <datalist id={resolvedListId}>
        {options.map((option) => (
          <option key={option.value} value={option.value} label={option.label} />
        ))}
      </datalist>
    </>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export function Radio({ label, className, ...props }: RadioProps) {
  return (
    <label className={classes(styles.checkControl, className)}>
      <input type="radio" {...props} />
      <span>{label}</span>
    </label>
  );
}

export interface RadioGroupProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  legend: string;
  children: ReactNode;
}

export function RadioGroup({ legend, children, className, ...props }: RadioGroupProps) {
  return (
    <fieldset className={classes(styles.radioGroup, className)} {...props}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.radioOptions}>{children}</div>
    </fieldset>
  );
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "role" | "type"> {
  label: string;
}

export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label className={classes(styles.switchControl, className)}>
      <input type="checkbox" role="switch" {...props} />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <span>{label}</span>
    </label>
  );
}
