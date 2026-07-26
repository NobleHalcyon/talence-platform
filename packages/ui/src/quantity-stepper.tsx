"use client";

import styles from "./primitives.module.css";

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  disabled?: boolean;
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  label = "Quantity",
  disabled = false,
}: QuantityStepperProps) {
  return (
    <div
      className={styles.quantity}
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      <button
        className={styles.quantityButton}
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <input
        className={styles.quantityValue}
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={value}
        readOnly
        disabled={disabled}
      />
      <button
        className={styles.quantityButton}
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
