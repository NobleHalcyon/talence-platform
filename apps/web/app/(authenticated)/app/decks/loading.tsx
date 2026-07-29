import { Skeleton } from "@talence/ui";

import styles from "@/components/shell/page-frame.module.css";

export default function DecksLoading() {
  return (
    <div className={styles.loadingStack} role="status" aria-label="Loading decks">
      <Skeleton className={styles.skeletonHeading} />
      <Skeleton className={styles.skeletonLine} />
      <Skeleton className={styles.skeletonLine} />
    </div>
  );
}
