import { Skeleton, VisuallyHidden } from "@talence/ui";

import styles from "@/components/shell/page-frame.module.css";

export default function AppLoading() {
  return (
    <div className={`${styles.frame} ${styles.loadingStack}`} role="status" aria-busy="true">
      <VisuallyHidden>Loading this view…</VisuallyHidden>
      <Skeleton className={styles.skeletonHeading} />
      <Skeleton className={styles.skeletonLine} />
      <Skeleton className={styles.skeletonLine} />
    </div>
  );
}
