import Link from "next/link";

import { TalenceMark } from "@/components/brand/talence-mark";

import styles from "./public-header.module.css";

export function PublicHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brandLink} href="/" aria-label="Talence home">
          <TalenceMark />
        </Link>
        <nav className={styles.nav} aria-label="Public navigation">
          <a className={styles.quietLink} href="#capabilities">
            Capabilities
          </a>
          <a className={styles.quietLink} href="#private-beta">
            Private beta
          </a>
          <Link className={styles.loginLink} href="/login">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
