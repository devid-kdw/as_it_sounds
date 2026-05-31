import "server-only";

export type EntitlementState = "unknown" | "allowed" | "requires_auth" | "requires_subscription";

export function getInitialEntitlementState(): EntitlementState {
  return "unknown";
}
