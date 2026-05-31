export const navigationItems = [
  { href: "/browse", label: "Browse" },
  { href: "/wander", label: "Wander" },
  { href: "/collections", label: "Collections" },
  { href: "/license", label: "License" },
  { href: "/account", label: "Account" },
  { href: "/admin", label: "Admin" },
] as const;

export const adminNavigationItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/upload", label: "Upload" },
  { href: "/admin/bulk-upload", label: "Bulk Upload" },
  { href: "/admin/samples", label: "Samples" },
  { href: "/admin/albums", label: "Albums" },
  { href: "/admin/processing", label: "Processing" },
  { href: "/admin/analytics", label: "Analytics" },
] as const;
