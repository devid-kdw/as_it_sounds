import Link from "next/link";
import type { ReactNode } from "react";
import { AdminStatusBadge, LifecycleBadge } from "@/components/admin/status-badge";
import { RouteShell } from "@/components/ui/route-shell";
import {
  getAdminAnalyticsDashboard,
  type AdminAnalyticsNoResultTrend,
  type AdminAnalyticsProcessingFailure,
  type AdminAnalyticsTopSample,
  type AdminAnalyticsWanderMoodIndicator,
  type AdminAnalyticsWanderSampleIndicator,
} from "@/lib/data/admin-analytics";
import { adminSampleEditRoute } from "@/lib/routes";

export default async function AdminAnalyticsPage() {
  const analytics = await getAdminAnalyticsDashboard({ dateRangeDays: 30 });
  const wanderSkipRate = analytics.totals.wanderShown
    ? analytics.totals.wanderSkipped / analytics.totals.wanderShown
    : 0;

  return (
    <RouteShell
      eyebrow="admin analytics"
      title="Curation signals"
      description="Read-only discovery feedback from search, sample engagement, processing health, and Wander events. Use these rows to improve hidden tags, metadata, and review priority."
    >
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="no-result searches" value={analytics.totals.noResultSearches} />
        <Metric label="repeated phrases" tone={analytics.totals.repeatedNoResultQueries > 0 ? "warning" : "default"} value={analytics.totals.repeatedNoResultQueries} />
        <Metric label="failed jobs" tone={analytics.totals.failedProcessingJobs > 0 ? "danger" : "default"} value={analytics.totals.failedProcessingJobs} />
        <Metric label="wander shown" value={analytics.totals.wanderShown} />
        <Metric label="wander plays" value={analytics.totals.wanderPlayed} />
        <Metric label="wander skip rate" tone={wanderSkipRate >= 0.7 ? "warning" : "default"} value={formatPercent(wanderSkipRate)} />
      </section>

      <Panel
        eyebrow="search feedback"
        title="Repeated no-result trends"
        badge={`${analytics.dateRangeDays} day window`}
      >
        <NoResultTrendTable trends={analytics.noResultTrends} />
      </Panel>

      <section className="grid gap-4 xl:grid-cols-3">
        <TopSamplePanel
          eyebrow="play signal"
          emptyText="No play stats have been recorded yet."
          items={analytics.topPlayedSamples}
          title="Most played samples"
          valueLabel="plays"
        />
        <TopSamplePanel
          eyebrow="download signal"
          emptyText="No download stats have been recorded yet."
          items={analytics.topDownloadedSamples}
          title="Most downloaded samples"
          valueLabel="downloads"
        />
        <TopSamplePanel
          eyebrow="favorite signal"
          emptyText="No favorite stats have been recorded yet."
          items={analytics.topFavoritedSamples}
          title="Most favorited samples"
          valueLabel="favorites"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Panel
          eyebrow="pipeline"
          title="Recent processing failures"
          badge={`${analytics.recentProcessingFailures.length} rows`}
        >
          <ProcessingFailureTable failures={analytics.recentProcessingFailures} />
        </Panel>
        <Panel
          eyebrow="wander mood fit"
          title="Mood skip/play indicators"
          badge={`${analytics.wanderMoodIndicators.length} moods`}
        >
          <WanderMoodTable moods={analytics.wanderMoodIndicators} />
        </Panel>
      </section>

      <Panel
        eyebrow="wander sample fit"
        title="Samples with skip pressure"
        badge={`${analytics.wanderSampleIndicators.length} samples`}
      >
        <WanderSampleTable samples={analytics.wanderSampleIndicators} />
      </Panel>

      <section className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="ais-meta text-ais-amber">handoff note</p>
            <h2 className="ais-title mt-1 text-xl text-ais-text">Use analytics as a curation queue</h2>
          </div>
          <AdminStatusBadge label={`generated ${formatDateTime(analytics.generatedAt)}`} tone="muted" />
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-ais-muted">
          This dashboard intentionally links to existing admin upload, sample edit, sample search, and processing routes.
          It suggests copyable hidden-tag phrases and metadata review notes, but leaves mutations in the established admin workspaces.
        </p>
      </section>
    </RouteShell>
  );
}

function NoResultTrendTable({ trends }: { trends: AdminAnalyticsNoResultTrend[] }) {
  if (trends.length === 0) {
    return (
      <EmptyRows>
        No no-result searches have been logged in this window. When they appear, repeated phrases will become hidden-tag or upload candidates.
      </EmptyRows>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[980px] text-left text-sm">
        <thead className="bg-ais-panel text-ais-faint">
          <tr>
            <ColumnHead>query</ColumnHead>
            <ColumnHead>filters</ColumnHead>
            <ColumnHead>source</ColumnHead>
            <ColumnHead>repeats</ColumnHead>
            <ColumnHead>last seen</ColumnHead>
            <ColumnHead>curation copy</ColumnHead>
            <ColumnHead>actions</ColumnHead>
          </tr>
        </thead>
        <tbody>
          {trends.map((trend) => (
            <tr className="border-t border-ais-border-soft align-top" key={trend.key}>
              <td className="max-w-56 px-4 py-3">
                <p className="break-words font-medium text-ais-text">{trend.query}</p>
                <p className="mt-1 font-ais-mono text-xs text-ais-faint">first {formatDate(trend.firstSeenAt)}</p>
              </td>
              <td className="max-w-64 px-4 py-3 text-ais-muted">{trend.filtersLabel}</td>
              <td className="px-4 py-3"><AdminStatusBadge label={trend.source} tone="muted" /></td>
              <td className="px-4 py-3 font-ais-mono text-ais-text">{trend.count}</td>
              <td className="px-4 py-3 text-ais-muted">{formatDate(trend.lastSeenAt)}</td>
              <td className="max-w-72 px-4 py-3">
                <code className="block rounded-ais-sm border border-ais-border-soft bg-ais-bg px-3 py-2 font-ais-mono text-xs leading-5 text-ais-amber">
                  {trend.suggestedCopy}
                </code>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <ActionLink href={trend.sampleSearchHref}>find matches</ActionLink>
                  <ActionLink href="/admin/upload">upload gap</ActionLink>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopSamplePanel({
  emptyText,
  eyebrow,
  items,
  title,
  valueLabel,
}: {
  emptyText: string;
  eyebrow: string;
  items: AdminAnalyticsTopSample[];
  title: string;
  valueLabel: string;
}) {
  return (
    <Panel eyebrow={eyebrow} title={title} badge={`${items.length} rows`}>
      {items.length === 0 ? (
        <EmptyRows>{emptyText}</EmptyRows>
      ) : (
        <div className="grid divide-y divide-ais-border-soft">
          {items.map((item) => (
            <div className="grid gap-3 px-4 py-3" key={item.sampleId}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="break-words font-medium text-ais-text">{item.displayTitle}</p>
                  <p className="mt-1 break-words font-ais-mono text-xs text-ais-amber">{item.poeticName}</p>
                </div>
                <div className="text-right">
                  <p className="font-ais-mono text-xl text-ais-text">{item.value}</p>
                  <p className="ais-meta text-ais-faint">{valueLabel}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <LifecycleBadge status={item.status} />
                {item.featured ? <AdminStatusBadge label="featured" tone="amber" /> : null}
                <AdminStatusBadge label={item.categorySlug} tone="muted" />
                <AdminStatusBadge label={item.sampleTypeSlug} tone="muted" />
              </div>
              <p className="text-xs leading-5 text-ais-muted">
                Hidden tags: {item.hiddenTags.length ? item.hiddenTags.join(", ") : "none yet"}
              </p>
              <p className="text-xs leading-5 text-ais-muted">{item.curationCue}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-ais-mono text-xs text-ais-faint">
                  {item.secondaryValue} {item.secondaryLabel}
                </p>
                <ActionLink href={adminSampleEditRoute(item.sampleId)}>edit metadata</ActionLink>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ProcessingFailureTable({ failures }: { failures: AdminAnalyticsProcessingFailure[] }) {
  if (failures.length === 0) {
    return <EmptyRows>No failed or timed-out processing jobs are visible right now.</EmptyRows>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[880px] text-left text-sm">
        <thead className="bg-ais-panel text-ais-faint">
          <tr>
            <ColumnHead>sample</ColumnHead>
            <ColumnHead>job</ColumnHead>
            <ColumnHead>error</ColumnHead>
            <ColumnHead>updated</ColumnHead>
            <ColumnHead>actions</ColumnHead>
          </tr>
        </thead>
        <tbody>
          {failures.map((failure) => (
            <tr className="border-t border-ais-border-soft align-top" key={failure.id}>
              <td className="max-w-60 px-4 py-3">
                <p className="break-words font-medium text-ais-text">{failure.sampleDisplayTitle ?? failure.originalFilename ?? "Unknown sample"}</p>
                <p className="mt-1 break-words font-ais-mono text-xs text-ais-amber">{failure.samplePoeticName ?? failure.id}</p>
              </td>
              <td className="px-4 py-3 text-ais-muted">
                <AdminStatusBadge label={failure.status.replaceAll("_", " ")} tone="danger" />
                <p className="mt-2 font-ais-mono text-xs text-ais-faint">{failure.jobType.replaceAll("_", " ")}</p>
                <p className="mt-1 font-ais-mono text-xs text-ais-faint">{failure.attempts} attempts</p>
              </td>
              <td className="max-w-72 px-4 py-3 text-ais-muted">
                <p className="font-ais-mono text-xs text-ais-danger">{failure.lastErrorCode ?? "error"}</p>
                <p className="mt-1 leading-5">{failure.lastErrorMessage ?? "Processing failed without a stored message."}</p>
              </td>
              <td className="px-4 py-3 text-ais-muted">{formatDate(failure.updatedAt)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <ActionLink href="/admin/processing?status=failed">processing</ActionLink>
                  {failure.sampleId ? <ActionLink href={adminSampleEditRoute(failure.sampleId)}>open sample</ActionLink> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WanderMoodTable({ moods }: { moods: AdminAnalyticsWanderMoodIndicator[] }) {
  if (moods.length === 0) {
    return <EmptyRows>No mood-scoped Wander events have been recorded in this window.</EmptyRows>;
  }

  return (
    <div className="grid divide-y divide-ais-border-soft">
      {moods.map((mood) => (
        <div className="grid gap-2 px-4 py-3" key={mood.moodSlug}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-ais-text">{mood.moodSlug}</p>
            <AdminStatusBadge label={`${formatPercent(mood.skipRate)} skipped`} tone={mood.skipRate >= 0.7 ? "warning" : "muted"} />
          </div>
          <p className="font-ais-mono text-xs text-ais-faint">
            shown {mood.shownCount} / skipped {mood.skippedCount} / played {mood.playedCount}
          </p>
          <p className="text-xs leading-5 text-ais-muted">
            {mood.shownCount > 0 && mood.playedCount === 0
              ? "Check whether this mood has enough fitting published samples."
              : "Use this mood as a consistency check during review."}
          </p>
        </div>
      ))}
    </div>
  );
}

function WanderSampleTable({ samples }: { samples: AdminAnalyticsWanderSampleIndicator[] }) {
  if (samples.length === 0) {
    return <EmptyRows>No sample-level Wander skip/play indicators are available yet.</EmptyRows>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[960px] text-left text-sm">
        <thead className="bg-ais-panel text-ais-faint">
          <tr>
            <ColumnHead>sample</ColumnHead>
            <ColumnHead>shown</ColumnHead>
            <ColumnHead>skipped</ColumnHead>
            <ColumnHead>played</ColumnHead>
            <ColumnHead>skip rate</ColumnHead>
            <ColumnHead>curation cue</ColumnHead>
            <ColumnHead>actions</ColumnHead>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr className="border-t border-ais-border-soft align-top" key={sample.sampleId}>
              <td className="max-w-64 px-4 py-3">
                <p className="break-words font-medium text-ais-text">{sample.sampleDisplayTitle}</p>
                <p className="mt-1 break-words font-ais-mono text-xs text-ais-amber">{sample.samplePoeticName}</p>
                <div className="mt-2"><LifecycleBadge status={sample.sampleStatus} /></div>
              </td>
              <td className="px-4 py-3 font-ais-mono text-ais-text">{sample.shownCount}</td>
              <td className="px-4 py-3 font-ais-mono text-ais-text">{sample.skippedCount}</td>
              <td className="px-4 py-3 font-ais-mono text-ais-text">{sample.playedCount}</td>
              <td className="px-4 py-3">
                <AdminStatusBadge label={formatPercent(sample.skipRate)} tone={sample.skipRate >= 0.7 ? "warning" : "muted"} />
              </td>
              <td className="max-w-80 px-4 py-3 text-ais-muted">{sample.curationCue}</td>
              <td className="px-4 py-3">
                <ActionLink href={adminSampleEditRoute(sample.sampleId)}>review tags</ActionLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({
  badge,
  children,
  eyebrow,
  title,
}: {
  badge: string;
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-ais-md border border-ais-border-soft bg-ais-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ais-border-soft px-4 py-3">
        <div>
          <p className="ais-meta text-ais-amber">{eyebrow}</p>
          <h2 className="ais-title mt-1 text-xl text-ais-text">{title}</h2>
        </div>
        <AdminStatusBadge label={badge} tone="muted" />
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "warning" | "danger";
  value: number | string;
}) {
  const labelClass = tone === "danger" ? "text-ais-danger" : tone === "warning" ? "text-ais-warning" : "text-ais-amber";

  return (
    <div className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <p className={`ais-meta ${labelClass}`}>{label}</p>
      <p className="ais-title mt-2 text-3xl text-ais-text">{value}</p>
    </div>
  );
}

function ColumnHead({ children }: { children: ReactNode }) {
  return <th className="px-4 py-2 font-ais-mono font-normal lowercase">{children}</th>;
}

function EmptyRows({ children }: { children: ReactNode }) {
  return <p className="p-5 text-sm leading-6 text-ais-muted">{children}</p>;
}

function ActionLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-xs font-medium text-ais-text transition hover:border-ais-amber"
      href={href}
    >
      {children}
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
