"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

const mobileItems = [
  PRIMARY_NAVIGATION[0],
  PRIMARY_NAVIGATION[1],
  PRIMARY_NAVIGATION[2],
  PRIMARY_NAVIGATION[3],
  PRIMARY_NAVIGATION[5],
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <nav className={styles.bottomNavigation} aria-label="Mobile navigation">
      {mobileItems.slice(0, 4).map((item) => {
        const active =
          item.href === "/app/settings"
            ? pathname.startsWith("/app/settings") || pathname.startsWith("/app/devices")
            : isActive(pathname, item.href);

        return (
          <Link
            className={`${styles.bottomLink} ${active ? styles.bottomLinkActive : ""}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            key={item.href}
          >
            {"shortLabel" in item ? item.shortLabel : item.label}
          </Link>
        );
      })}
      <div className={styles.bottomMore}>
        <button
          className={`${styles.bottomLink} ${
            pathname.startsWith("/app/settings") || pathname.startsWith("/app/devices")
              ? styles.bottomLinkActive
              : ""
          }`}
          type="button"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen((open) => !open)}
        >
          More
        </button>
        {moreOpen ? (
          <div className={styles.moreMenu} id="mobile-more-menu">
            <Link
              className={styles.moreMenuLink}
              href="/app/devices"
              onClick={() => setMoreOpen(false)}
            >
              <span>Devices</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              className={styles.moreMenuLink}
              href="/app/settings"
              onClick={() => setMoreOpen(false)}
            >
              <span>Settings</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
