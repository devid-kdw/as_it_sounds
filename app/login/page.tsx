import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function LoginPage() {
  return (
    <RouteShell
      eyebrow="login"
      title="Auth entry shell"
      description="Supabase Auth UI and callback exchange will be implemented in the auth phase."
    >
      <EmptyState
        eyebrow="auth pending"
        title="Login form is not implemented yet"
        description="This placeholder avoids fake sessions and keeps the auth boundary explicit."
      />
    </RouteShell>
  );
}
