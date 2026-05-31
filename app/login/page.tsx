import { LoginForm } from "@/app/login/login-form";
import { getAccessConfig } from "@/lib/entitlement";
import { RouteShell } from "@/components/ui/route-shell";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(readParam(params?.next));
  const initialMode = readParam(params?.mode) === "signup" ? "signup" : "login";
  const authMessage = readParam(params?.error) ?? readParam(params?.auth);
  const { accessMode } = getAccessConfig();
  const showDevelopmentMode = process.env.NODE_ENV !== "production";

  return (
    <RouteShell
      eyebrow="login"
      title="Welcome back"
      description="Use your AIS account to save collections, download entitled samples, and reach admin tools when your profile allows it."
    >
      <div className="grid gap-4">
        {showDevelopmentMode ? (
          <p className="max-w-xl rounded-ais-sm border border-ais-border-soft bg-ais-surface px-4 py-3 text-sm text-ais-muted">
            Development access mode: <span className="text-ais-text">{accessMode}</span>
          </p>
        ) : null}
        <LoginForm authMessage={authMessage} initialMode={initialMode} nextPath={nextPath} />
      </div>
    </RouteShell>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/browse";
  }

  if (value.startsWith("/login") || value.startsWith("/auth/callback")) {
    return "/browse";
  }

  return value;
}
