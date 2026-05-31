export const siteConfig = {
  name: "As It Sounds",
  shortName: "AIS",
  description: "A curated, poetic, mood-first sample library.",
  localUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;
