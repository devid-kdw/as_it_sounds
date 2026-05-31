import "server-only";

export type AccessMode = "local_owner" | "free_launch" | "paid_test" | "paid_live";
export type BillingMode = "disabled" | "test" | "live";

export function getAccessMode(): AccessMode {
  return (process.env.AIS_ACCESS_MODE as AccessMode | undefined) ?? "local_owner";
}

export function getBillingMode(): BillingMode {
  return (process.env.AIS_BILLING_MODE as BillingMode | undefined) ?? "disabled";
}
