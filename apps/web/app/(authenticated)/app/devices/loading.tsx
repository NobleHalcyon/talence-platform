import { Skeleton } from "@talence/ui";

import styles from "@/components/shell/page-frame.module.css";

export default function DevicesLoading() {
  return (
    <div className={styles.loadingStack} role="status" aria-label="Loading devices">
      <Skeleton className={styles.skeletonHeading} />
      <Skeleton className={styles.skeletonLine} />
      <Skeleton className={styles.skeletonLine} />
    </div>
  );
}
