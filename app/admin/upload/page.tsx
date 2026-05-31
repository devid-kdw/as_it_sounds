import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AdminUploadPage() {
  return (
    <RouteShell
      eyebrow="admin upload"
      title="Single upload shell"
      description="The upload surface is intentionally structural only. WAV validation, previews, peaks, and publish gates belong to later backend and audio phases."
    >
      <EmptyState
        eyebrow="upload pending"
        title="No upload workflow is implemented yet"
        description="Original WAV paths and Service Role credentials must never reach the browser."
      />
    </RouteShell>
  );
}
