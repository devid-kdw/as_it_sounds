"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function SampleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState error={error} reset={reset} title="Sample detail could not render" />;
}
