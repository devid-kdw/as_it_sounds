"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function BrowseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState error={error} reset={reset} title="Browse could not render" />;
}
