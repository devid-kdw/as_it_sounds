import Link from "next/link";
import { navigationItems } from "@/config/navigation";

export function SiteNav() {
  return (
    <header className="border-b border-ais-border-soft bg-[var(--ais-overlay)]">
      <nav className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link className="ais-title text-2xl text-ais-text" href="/">
          As It Sounds
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {navigationItems.map((item) => (
            <Link
              className="rounded-ais-sm px-3 py-2 text-sm text-ais-muted transition duration-ais-base hover:bg-ais-panel hover:text-ais-text"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
