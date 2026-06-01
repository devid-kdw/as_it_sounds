export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type PlayerSample = {
  sampleId: string;
  poeticName: string;
  title: string;
  previewUrl: string | null;
  peaksUrl: string | null;
  durationSeconds: number | null;
  loopable: boolean;
};
