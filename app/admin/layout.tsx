import Link from "next/link";
import { adminNavigationItems } from "@/config/navigation";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-4">
        <p className="ais-meta mb-3 text-ais-amber">admin shell</p>
        <nav className="grid gap-1">
          {adminNavigationItems.map((item) => (
            <Link
              className="rounded-ais-sm px-3 py-2 text-sm text-ais-muted transition duration-ais-base hover:bg-ais-panel hover:text-ais-text"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
