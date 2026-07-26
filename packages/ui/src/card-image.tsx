"use client";

import { useState } from "react";

import styles from "./primitives.module.css";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface CardImageProps {
  src?: string | null;
  alt: string;
  faces?: readonly CardImageFace[];
  faceIndex?: number;
  defaultFaceIndex?: number;
  onFaceChange?: (faceIndex: number) => void;
  fallbackLabel?: string;
  className?: string;
}

export interface CardImageFace {
  src?: string | null;
  alt: string;
  label?: string;
}

export function CardImage({
  src,
  alt,
  faces,
  faceIndex,
  defaultFaceIndex = 0,
  onFaceChange,
  fallbackLabel = "Card image unavailable",
  className,
}: CardImageProps) {
  const [internalFaceIndex, setInternalFaceIndex] = useState(defaultFaceIndex);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const requestedFaceIndex = faceIndex ?? internalFaceIndex;
  const activeFaceIndex =
    faces && faces.length > 0 ? Math.min(Math.max(requestedFaceIndex, 0), faces.length - 1) : 0;
  const activeFace = faces?.[activeFaceIndex];
  const activeSrc = activeFace?.src ?? src;
  const activeAlt = activeFace?.alt ?? alt;
  const canRenderImage = Boolean(activeSrc && activeSrc !== failedSrc);

  function showFace(nextFaceIndex: number) {
    if (faceIndex === undefined) {
      setInternalFaceIndex(nextFaceIndex);
    }
    onFaceChange?.(nextFaceIndex);
  }

  return (
    <span className={classes(styles.cardImageContainer, className)}>
      <span className={styles.cardImageFrame}>
        {canRenderImage && activeSrc ? (
          // Provider images intentionally bypass server-side optimization/proxying.
          <img
            className={styles.cardImage}
            src={activeSrc}
            alt={activeAlt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedSrc(activeSrc)}
          />
        ) : (
          <span className={styles.cardImageFallback} role="img" aria-label={activeAlt}>
            {fallbackLabel}
          </span>
        )}
      </span>
      {faces && faces.length > 1 ? (
        <span className={styles.cardFaceControls}>
          <span className={styles.cardFaceStatus}>
            {activeFace?.label ?? `Face ${activeFaceIndex + 1}`} of {faces.length}
          </span>
          <button
            className={styles.cardFaceButton}
            type="button"
            onClick={() => showFace((activeFaceIndex + 1) % faces.length)}
          >
            Show next face
          </button>
        </span>
      ) : null}
    </span>
  );
}
