export const routes = {
  home: "/",
  browse: "/browse",
  wander: "/wander",
  collections: "/collections",
  account: "/account",
  login: "/login",
  license: "/license",
  admin: "/admin",
} as const;

export function sampleDetailRoute(poeticName: string) {
  return `/samples/${encodeURIComponent(poeticName)}`;
}

export function adminSampleEditRoute(sampleId: string) {
  return `/admin/samples/${encodeURIComponent(sampleId)}/edit`;
}
