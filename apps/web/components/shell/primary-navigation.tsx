"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRIMARY_NAVIGATION } from "@talence/domain";

import styles from "./app-shell.module.css";

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.desktopNavigation} aria-label="Primary navigation">
      <ul className={styles.navList}>
        {PRIMARY_NAVIGATION.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.bottomNavigation} aria-label="Mobile navigation">
      {PRIMARY_NAVIGATION.map((item) => {
        const active = isActive(pathname, item.href);

        return (
          <Link
            className={`${styles.bottomLink} ${active ? styles.bottomLinkActive : ""}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
