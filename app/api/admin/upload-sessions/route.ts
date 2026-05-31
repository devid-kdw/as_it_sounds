import { notImplementedRoute } from "@/lib/api-placeholder";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  await requireAdmin("/admin/upload");
  return notImplementedRoute("admin upload session");
}
