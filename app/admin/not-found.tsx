import { NotFoundState } from "@/components/ui/not-found-state";

export default function AdminNotFound() {
  return (
    <NotFoundState
      title="Admin route not found"
      description="Admin resources must use authorized server-side lookups before rendering."
    />
  );
}
