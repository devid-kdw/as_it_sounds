// Compatibility wrapper: preserves the /api/account/billing/checkout billing_disabled 409 contract.
export const runtime = "nodejs";

export { POST } from "@/app/api/billing/checkout/route";
