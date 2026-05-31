import { NotFoundState } from "@/components/ui/not-found-state";

export default function SampleNotFound() {
  return (
    <NotFoundState
      title="Sample not found"
      description="Sample detail pages must only render published samples for the requested poetic name."
    />
  );
}
