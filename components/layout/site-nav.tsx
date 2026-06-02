import Link from "next/link";
import { navigationItems } from "@/config/navigation";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function SiteNav() {
  const [canSeeAdmin, canSeeLocalCrates] = await Promise.all([canSeeAdminNav(), canSeeLocalCratesNav()]);
  const visibleItems = navigationItems
    .filter((item) => item.href !== "/admin" || canSeeAdmin)
    .filter((item) => !("localOwnerOnly" in item && item.localOwnerOnly) || canSeeLocalCrates);

  return (
    <header className="border-b border-ais-border-soft bg-[var(--ais-overlay)]">
      <nav className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link className="ais-title text-2xl text-ais-text" href="/">
          As It Sounds
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {visibleItems.map((item) => (
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

async function canSeeLocalCratesNav() {
  try {
    const entitlement = await getEntitlementForCurrentUser();

    return (
      entitlement.accessMode === "local_owner" &&
      entitlement.isAuthenticated &&
      (entitlement.isAdmin || entitlement.subscriptionStatus === "lifetime_granted" || entitlement.canUsePlugin)
    );
  } catch {
    return false;
  }
}

async function canSeeAdminNav() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return data?.role === "admin";
  } catch {
    return false;
  }
}
