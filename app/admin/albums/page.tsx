import {
  AdminStatusBadge,
  LifecycleBadge,
} from "@/components/admin/status-badge";
import { RouteShell } from "@/components/ui/route-shell";
import { listAdminAlbums } from "@/lib/data/admin";

export default async function AdminAlbumsPage() {
  const { albums } = await listAdminAlbums();
  const draftCount = albums.filter((album) => album.status === "draft").length;
  const publishedCount = albums.filter((album) => album.status === "published").length;
  const archivedCount = albums.filter((album) => album.status === "archived").length;

  return (
    <RouteShell
      eyebrow="admin albums"
      title="Album management"
      description="Create draft albums, edit metadata, assign samples through album_samples, reorder membership, then publish or archive without replacing sample-level discovery."
    >
      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="albums" value={albums.length} />
        <Metric label="draft" value={draftCount} />
        <Metric label="published" value={publishedCount} />
        <Metric label="archived" value={archivedCount} />
      </section>

      <section className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="ais-meta text-ais-amber">create draft</p>
            <h2 className="ais-title mt-2 text-xl text-ais-text">Album metadata</h2>
            <p className="mt-2 text-sm leading-6 text-ais-muted">
              The API route creates `status: draft`; publish requires title and slug, while missing artwork remains allowed.
            </p>
          </div>
          <form className="grid gap-3 md:grid-cols-2" action="/api/admin/albums" method="post">
            <label className="grid gap-1 text-sm text-ais-muted">
              <span className="ais-meta text-ais-faint">title</span>
              <input className="ais-input" name="title" placeholder="Rain Rooms" />
            </label>
            <label className="grid gap-1 text-sm text-ais-muted">
              <span className="ais-meta text-ais-faint">slug</span>
              <input className="ais-input" name="slug" placeholder="rain-rooms" />
            </label>
            <label className="grid gap-1 text-sm text-ais-muted md:col-span-2">
              <span className="ais-meta text-ais-faint">description</span>
              <textarea className="ais-input min-h-24" name="description" placeholder="Short album atmosphere" />
            </label>
            <button className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-muted" disabled type="button">
              Create via API client
            </button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-ais-md border border-ais-border-soft bg-ais-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ais-border-soft px-4 py-3">
          <div>
            <p className="ais-meta text-ais-amber">draft / published / archived</p>
            <h2 className="ais-title mt-1 text-xl text-ais-text">Curated groupings</h2>
          </div>
          <AdminStatusBadge label="album_samples reorder supported" tone="muted" />
        </div>

        {albums.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-ais-muted">
            No albums yet. Use the API-backed create flow to start a draft album, then assign and reorder samples.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] text-left text-sm">
              <thead className="bg-ais-panel text-ais-faint">
                <tr>
                  <ColumnHead>album</ColumnHead>
                  <ColumnHead>status</ColumnHead>
                  <ColumnHead>samples</ColumnHead>
                  <ColumnHead>artwork</ColumnHead>
                  <ColumnHead>timestamps</ColumnHead>
                  <ColumnHead>actions</ColumnHead>
                </tr>
              </thead>
              <tbody>
                {albums.map((album) => (
                  <tr className="border-t border-ais-border-soft align-top" key={album.id}>
                    <td className="max-w-72 px-4 py-3">
                      <p className="break-words font-medium text-ais-text">{album.title}</p>
                      <p className="mt-1 break-words font-ais-mono text-xs text-ais-amber">{album.slug}</p>
                      {album.description ? <p className="mt-2 line-clamp-2 text-ais-muted">{album.description}</p> : null}
                    </td>
                    <td className="px-4 py-3"><LifecycleBadge status={album.status} /></td>
                    <td className="px-4 py-3 text-ais-muted">{album.sample_count} assigned</td>
                    <td className="px-4 py-3">
                      {album.cover_image_path ? <AdminStatusBadge label="cover set" tone="success" /> : <AdminStatusBadge label="artwork optional" tone="muted" />}
                    </td>
                    <td className="px-4 py-3 text-ais-muted">
                      <p>updated {formatDate(album.updated_at)}</p>
                      <p className="mt-1">published {formatDate(album.published_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2">
                        <AdminStatusBadge label="edit metadata" tone="muted" />
                        <AdminStatusBadge label="assign/remove/reorder samples" tone="muted" />
                        <AdminStatusBadge label={album.status === "published" ? "archive available" : "publish available"} tone="amber" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </RouteShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <p className="ais-meta text-ais-amber">{label}</p>
      <p className="ais-title mt-2 text-3xl text-ais-text">{value}</p>
    </div>
  );
}

function ColumnHead({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 font-ais-mono font-normal lowercase">{children}</th>;
}

function formatDate(value: string | null) {
  if (!value) {
    return "not set";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}
