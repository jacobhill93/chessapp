"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, Target } from "lucide-react";
import styles from "./AppRail.module.css";

/**
 * The app's persistent left-hand nav, shared by every page — meant to grow
 * as more top-level destinations get added, rather than each page hand-
 * rolling its own back-link (which is how games/[uuid] and train/[motif]
 * used to do it, and how the library/train pages had no nav at all).
 */
const NAV_ITEMS: {
  href: string;
  label: string;
  Icon: typeof Library;
  isActive: (pathname: string) => boolean;
}[] = [
  { href: "/", label: "Library", Icon: Library, isActive: (path) => path === "/" },
  { href: "/train", label: "Train", Icon: Target, isActive: (path) => path.startsWith("/train") },
];

export function AppRail({ username }: { username?: string }) {
  const pathname = usePathname();
  const query = username ? `?username=${encodeURIComponent(username)}` : "";

  return (
    <aside className={styles.rail}>
      <Link href={`/${query}`} className={styles.brand}>
        Chess Training
      </Link>
      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ href, label, Icon, isActive }) => (
          <Link
            key={href}
            href={`${href}${query}`}
            className={`${styles.navLink} ${isActive(pathname) ? styles.active : ""}`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
