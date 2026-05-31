"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  authMessage?: string;
  initialMode?: AuthMode;
  nextPath: string;
};

type AuthMode = "login" | "signup";

const authMessages: Record<string, string> = {
  callback_missing_code: "The auth callback was missing a session code. Please sign in again.",
  email_confirmation_required: "Confirm your email address, then sign in again.",
  invalid_credentials: "Invalid email or password.",
  session_expired: "Your session expired. Please sign in again.",
};

export function LoginForm({ authMessage, initialMode = "login", nextPath }: LoginFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    authMessage ? authMessages[authMessage] ?? authMessage : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const authEmail = email.trim();

    if (mode === "login") {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (loginError) {
        setError(normalizeClientAuthError(loginError.message));
        setIsSubmitting(false);
        return;
      }

      router.push(nextPath);
      router.refresh();
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { data, error: signupError } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (signupError) {
      setError(normalizeClientAuthError(signupError.message));
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.push(nextPath);
      router.refresh();
      return;
    }

    setMessage("Check your email to confirm the account before signing in.");
    setIsSubmitting(false);
  }

  return (
    <form
      className="grid max-w-xl gap-5 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6"
      onSubmit={handleSubmit}
    >
      <div className="flex rounded-ais-sm border border-ais-border-soft bg-ais-surface p-1">
        <button
          className={modeButtonClass(mode === "login")}
          onClick={() => {
            setMode("login");
            setError(null);
            setMessage(null);
          }}
          type="button"
        >
          <LogIn size={16} aria-hidden="true" />
          Login
        </button>
        <button
          className={modeButtonClass(mode === "signup")}
          onClick={() => {
            setMode("signup");
            setError(null);
            setMessage(null);
          }}
          type="button"
        >
          <UserPlus size={16} aria-hidden="true" />
          Sign up
        </button>
      </div>

      <label className="grid gap-2 text-sm font-medium text-ais-text">
        Email
        <input
          autoComplete="email"
          className="rounded-ais-sm border border-ais-border-soft bg-ais-bg px-3 py-3 text-ais-text outline-none transition focus:border-ais-amber"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-ais-text">
        Password
        <input
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="rounded-ais-sm border border-ais-border-soft bg-ais-bg px-3 py-3 text-ais-text outline-none transition focus:border-ais-amber"
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <p className="rounded-ais-sm border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-ais-sm border border-ais-amber/30 bg-ais-amber/10 px-3 py-2 text-sm text-ais-text">
          {message}
        </p>
      ) : null}

      <button
        className="inline-flex items-center justify-center gap-2 rounded-ais-sm bg-ais-amber px-5 py-3 font-medium text-ais-bg transition hover:bg-ais-pale-green disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {mode === "login" ? <LogIn size={18} aria-hidden="true" /> : <UserPlus size={18} aria-hidden="true" />}
        {isSubmitting ? "Working..." : mode === "login" ? "Login" : "Create account"}
      </button>
    </form>
  );
}

function modeButtonClass(isActive: boolean) {
  return [
    "inline-flex flex-1 items-center justify-center gap-2 rounded-ais-sm px-3 py-2 text-sm font-medium transition",
    isActive ? "bg-ais-amber text-ais-bg" : "text-ais-muted hover:bg-ais-panel hover:text-ais-text",
  ].join(" ");
}

function normalizeClientAuthError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("email not confirmed") || lower.includes("confirmation")) {
    return authMessages.email_confirmation_required;
  }

  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return authMessages.invalid_credentials;
  }

  return message || "Authentication failed.";
}
