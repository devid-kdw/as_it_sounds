import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AdminAlbumsPage() {
  return (
    <RouteShell
      eyebrow="admin albums"
      title="Album management shell"
      description="Album curation route structure is present for later database-backed implementation."
    >
      <EmptyState
        eyebrow="albums pending"
        title="No album data is connected yet"
        description="Public album behavior must only expose published assets when implemented."
      />
    </RouteShell>
  );
}
