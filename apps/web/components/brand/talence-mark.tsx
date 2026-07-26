import styles from "./talence-mark.module.css";

export function TalenceMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brand} ${compact ? styles.compact : ""}`}>
      <svg className={styles.mark} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path
          d="M16 2.75 27.5 9.4v13.2L16 29.25 4.5 22.6V9.4L16 2.75Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M9.75 11.25h12.5M16 11.25v12M11.5 18.75h9"
          fill="none"
          stroke="currentColor"
          strokeLinecap="square"
          strokeWidth="2"
        />
        <path d="M16 5.75 18 8h-4l2-2.25Z" fill="#C29A3A" />
      </svg>
      <span className={styles.word}>Talence</span>
    </span>
  );
}
