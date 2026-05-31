import "server-only";

export type AssetKind = "preview" | "waveform_peaks" | "original_wav" | "artwork";

export function assertPublicAssetKind(kind: AssetKind) {
  if (kind === "original_wav") {
    throw new Error("Original WAV assets must never be exposed through public asset helpers.");
  }
}
