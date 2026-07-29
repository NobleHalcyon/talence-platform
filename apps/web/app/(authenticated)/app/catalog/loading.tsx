import { Skeleton } from "@talence/ui";

import { PageFrame } from "@/components/shell/page-frame";

import styles from "./catalog-loading.module.css";

export default function CatalogLoading() {
  return (
    <PageFrame
      eyebrow="MTG catalog"
      title="Loading catalog"
      description="Reading the active admitted-user catalog and its freshness metadata."
    >
      <div className={styles.loading} role="status" aria-label="Loading catalog results">
        <Skeleton className={styles.search} />
        <div className={styles.grid}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className={styles.card} key={index} />
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
