"use client";

import { useState, type FormEvent } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";

type BillingActionFormProps = {
  action: "checkout" | "portal";
  endpoint: "/api/billing/checkout" | "/api/billing/portal";
  label: string;
  returnPath?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
};

type BillingResponse = {
  ok?: boolean;
  url?: string;
  code?: string;
  error?: string;
  message?: string;
};

export function BillingActionForm({
  action,
  endpoint,
  label,
  returnPath = "/account/billing",
  variant = "secondary",
  disabled = false,
}: BillingActionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnPath }),
      });
      const payload = (await response.json().catch(() => ({}))) as BillingResponse;

      if (response.ok && typeof payload.url === "string" && payload.url.length > 0) {
        window.location.assign(payload.url);
        return;
      }

      setErrorMessage(formatBillingError(payload, response.status));
    } catch {
      setErrorMessage("Unable to reach AIS billing. Try again from this page in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const Icon = isSubmitting ? Loader2 : action === "checkout" ? CreditCard : ExternalLink;

  return (
    <form action={endpoint} className="grid gap-2" method="post" onSubmit={handleSubmit}>
      <button
        className={
          variant === "primary"
            ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-ais-sm bg-ais-amber px-4 py-3 text-sm font-medium text-ais-bg transition hover:bg-ais-pale-green disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex min-h-12 items-center justify-center gap-2 rounded-ais-sm border border-ais-border-soft px-4 py-3 text-sm font-medium text-ais-text transition hover:border-ais-amber disabled:cursor-not-allowed disabled:opacity-60"
        }
        disabled={disabled || isSubmitting}
        type="submit"
      >
        <Icon className={isSubmitting ? "animate-spin" : undefined} size={16} aria-hidden="true" />
        {isSubmitting ? "Opening Stripe" : label}
      </button>
      {errorMessage ? (
        <p className="text-sm leading-6 text-ais-warning" role="status">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}

function formatBillingError(payload: BillingResponse, status: number) {
  const code = payload.code ?? payload.error;

  if (code === "billing_disabled") {
    return "Billing is disabled for the current AIS access mode.";
  }

  if (code === "stripe_customer_missing") {
    return "No Stripe customer is linked yet. Start checkout first, then return here.";
  }

  if (code === "paid_preview_not_ready") {
    return "Paid live billing is closed while preview/download safety is still being verified.";
  }

  if (code === "stripe_not_configured") {
    return "Stripe is not configured for this AIS environment yet.";
  }

  if (payload.message) {
    return payload.message;
  }

  return `Billing request failed with status ${status}.`;
}
