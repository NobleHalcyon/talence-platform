import { Skeleton } from "@talence/ui";

import styles from "./catalog-loading.module.css";

export default function CatalogLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.loading} role="status" aria-label="Loading catalog results">
        <Skeleton className={styles.search} />
        <div className={styles.grid}>
          {Array.from({ length: 30 }, (_, index) => (
            <Skeleton className={styles.card} key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
