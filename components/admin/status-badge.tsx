import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  PauseCircle,
  RotateCcw,
} from "lucide-react";

type AdminBadgeTone = "muted" | "info" | "success" | "warning" | "danger" | "amber";

type AdminStatusBadgeProps = {
  label: string;
  tone?: AdminBadgeTone;
  pulse?: boolean;
};

const toneClasses: Record<AdminBadgeTone, string> = {
  muted: "border-ais-border-soft bg-ais-panel text-ais-muted",
  info: "border-ais-border bg-ais-elevated text-ais-text",
  success: "border-ais-success bg-ais-elevated text-ais-success",
  warning: "border-ais-warning bg-ais-elevated text-ais-warning",
  danger: "border-ais-danger bg-ais-elevated text-ais-danger",
  amber: "border-ais-amber bg-ais-elevated text-ais-amber",
};

export function AdminStatusBadge({ label, pulse = false, tone = "muted" }: AdminStatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-ais-mono text-[0.68rem] lowercase leading-none",
        toneClasses[tone],
      ].join(" ")}
    >
      <StatusDot tone={tone} pulse={pulse} />
      {label}
    </span>
  );
}

export function LifecycleBadge({ status }: { status: string }) {
  const tone: AdminBadgeTone =
    status === "published"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "processing" || status === "needs_review"
          ? "amber"
          : status === "archived"
            ? "warning"
            : "muted";

  return <AdminStatusBadge label={status.replaceAll("_", " ")} tone={tone} />;
}

export function ProcessingStatusBadge({
  retryEligible = false,
  status,
  stuck = false,
}: {
  retryEligible?: boolean;
  status: string | null;
  stuck?: boolean;
}) {
  if (!status) {
    return <AdminStatusBadge label="no job" tone="muted" />;
  }

  if (stuck) {
    return <AdminStatusBadge label="stuck running" pulse tone="warning" />;
  }

  if (retryEligible) {
    return <AdminStatusBadge label="retry available" tone="warning" />;
  }

  const tone: AdminBadgeTone =
    status === "succeeded"
      ? "success"
      : status === "failed" || status === "timed_out" || status === "canceled"
        ? "danger"
        : status === "running"
          ? "amber"
          : "muted";

  return <AdminStatusBadge label={status.replaceAll("_", " ")} pulse={status === "running"} tone={tone} />;
}

export function LicenseStatusBadge({ status }: { status: string }) {
  const tone: AdminBadgeTone =
    status === "verified"
      ? "success"
      : status === "blocked" || status === "archived"
        ? "danger"
        : status === "restricted"
          ? "warning"
          : "muted";

  return <AdminStatusBadge label={status.replaceAll("_", " ")} tone={tone} />;
}

export function AssetStatusBadge({
  label,
  present,
}: {
  label: string;
  present: boolean;
}) {
  return (
    <AdminStatusBadge
      label={present ? label : `missing ${label}`}
      tone={present ? "success" : "warning"}
    />
  );
}

export function StatusIcon({ status }: { status: string | null }) {
  if (status === "succeeded" || status === "published" || status === "verified") {
    return <CheckCircle2 aria-hidden="true" className="text-ais-success" size={17} />;
  }

  if (status === "failed" || status === "timed_out" || status === "blocked") {
    return <AlertTriangle aria-hidden="true" className="text-ais-danger" size={17} />;
  }

  if (status === "running" || status === "processing") {
    return <Loader2 aria-hidden="true" className="animate-spin text-ais-amber" size={17} />;
  }

  if (status === "queued" || status === "draft" || status === "needs_review") {
    return <Clock3 aria-hidden="true" className="text-ais-amber" size={17} />;
  }

  if (status === "archived" || status === "canceled") {
    return <PauseCircle aria-hidden="true" className="text-ais-warning" size={17} />;
  }

  if (status === "retry") {
    return <RotateCcw aria-hidden="true" className="text-ais-warning" size={17} />;
  }

  return <Circle aria-hidden="true" className="text-ais-faint" size={13} />;
}

function StatusDot({ pulse, tone }: { pulse: boolean; tone: AdminBadgeTone }) {
  const color =
    tone === "success"
      ? "bg-ais-success"
      : tone === "danger"
        ? "bg-ais-danger"
        : tone === "warning"
          ? "bg-ais-warning"
          : tone === "amber"
            ? "bg-ais-amber"
            : "bg-ais-faint";

  return <span aria-hidden="true" className={["size-1.5 rounded-full", color, pulse ? "animate-pulse" : ""].join(" ")} />;
}
