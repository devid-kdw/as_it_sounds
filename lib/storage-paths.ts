export const AIS_STORAGE_BUCKETS = {
  originals: "ais-originals",
  previews: "ais-previews",
  waveforms: "ais-waveforms",
  albumArtwork: "ais-album-artwork",
  processingTemp: "ais-processing-temp",
} as const;

export const AIS_PUBLIC_STORAGE_BUCKETS = [
  AIS_STORAGE_BUCKETS.previews,
  AIS_STORAGE_BUCKETS.waveforms,
  AIS_STORAGE_BUCKETS.albumArtwork,
] as const;

export const AIS_PRIVATE_STORAGE_BUCKETS = [
  AIS_STORAGE_BUCKETS.originals,
  AIS_STORAGE_BUCKETS.processingTemp,
] as const;

export type StorageBucketKind = keyof typeof AIS_STORAGE_BUCKETS;
export type AISStorageBucketName = (typeof AIS_STORAGE_BUCKETS)[StorageBucketKind];

export type StoredObjectRef = {
  bucket: AISStorageBucketName | (string & {});
  objectPath: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function normalizeUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }

  return value.toLowerCase();
}

function normalizeSha256(value: string, label: string): string {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 hex digest.`);
  }

  return value.toLowerCase();
}

export function assertStorageBucketName(bucket: string): string {
  if (!BUCKET_PATTERN.test(bucket)) {
    throw new Error("Storage bucket names must use lowercase letters, numbers, and hyphens.");
  }

  return bucket;
}

export function normalizeStorageObjectPath(objectPath: string): string {
  if (!objectPath || objectPath.startsWith("/") || objectPath.includes("\\")) {
    throw new Error("Storage object paths must be relative paths.");
  }

  const segments = objectPath.split("/");

  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Storage object paths must not contain empty or traversal segments.");
  }

  return objectPath;
}

export function createStoredObjectRef(bucket: string, objectPath: string): StoredObjectRef {
  return {
    bucket: assertStorageBucketName(bucket),
    objectPath: normalizeStorageObjectPath(objectPath),
  };
}

export function storageBucketName(kind: StorageBucketKind): AISStorageBucketName {
  return AIS_STORAGE_BUCKETS[kind];
}

export function isPublicStorageBucket(bucket: string): boolean {
  return AIS_PUBLIC_STORAGE_BUCKETS.includes(bucket as (typeof AIS_PUBLIC_STORAGE_BUCKETS)[number]);
}

export function isPrivateStorageBucket(bucket: string): boolean {
  return AIS_PRIVATE_STORAGE_BUCKETS.includes(bucket as (typeof AIS_PRIVATE_STORAGE_BUCKETS)[number]);
}

export function originalWavObjectPath(input: { sampleId: string; sha256: string }): string {
  const sampleId = normalizeUuid(input.sampleId, "sampleId");
  const sha256 = normalizeSha256(input.sha256, "sha256");

  return `samples/${sampleId}/original/${sha256}.wav`;
}

export function originalWavRef(input: { sampleId: string; sha256: string }): StoredObjectRef {
  return createStoredObjectRef(AIS_STORAGE_BUCKETS.originals, originalWavObjectPath(input));
}

export function intakeUploadObjectPath(input: { sampleId: string; uploadSessionId: string }): string {
  const sampleId = normalizeUuid(input.sampleId, "sampleId");
  const uploadSessionId = normalizeUuid(input.uploadSessionId, "uploadSessionId");

  return `intake/${sampleId}/${uploadSessionId}/source.wav`;
}

export function intakeUploadRef(input: { sampleId: string; uploadSessionId: string }): StoredObjectRef {
  return createStoredObjectRef(AIS_STORAGE_BUCKETS.processingTemp, intakeUploadObjectPath(input));
}

export function bulkIntakeUploadObjectPath(input: { batchId: string; sampleId: string }): string {
  const batchId = normalizeUuid(input.batchId, "batchId");
  const sampleId = normalizeUuid(input.sampleId, "sampleId");

  return `intake/batches/${batchId}/${sampleId}/source.wav`;
}

export function bulkIntakeUploadRef(input: { batchId: string; sampleId: string }): StoredObjectRef {
  return createStoredObjectRef(AIS_STORAGE_BUCKETS.processingTemp, bulkIntakeUploadObjectPath(input));
}

export function previewAudioObjectPath(input: { sampleId: string; processingJobId: string }): string {
  const sampleId = normalizeUuid(input.sampleId, "sampleId");
  const processingJobId = normalizeUuid(input.processingJobId, "processingJobId");

  return `samples/${sampleId}/preview/${processingJobId}.mp3`;
}

export function previewAudioRef(input: { sampleId: string; processingJobId: string }): StoredObjectRef {
  return createStoredObjectRef(AIS_STORAGE_BUCKETS.previews, previewAudioObjectPath(input));
}

export function waveformPeaksObjectPath(input: { sampleId: string; processingJobId: string }): string {
  const sampleId = normalizeUuid(input.sampleId, "sampleId");
  const processingJobId = normalizeUuid(input.processingJobId, "processingJobId");

  return `samples/${sampleId}/waveform/${processingJobId}.json`;
}

export function waveformPeaksRef(input: { sampleId: string; processingJobId: string }): StoredObjectRef {
  return createStoredObjectRef(AIS_STORAGE_BUCKETS.waveforms, waveformPeaksObjectPath(input));
}

export function albumArtworkObjectPath(input: { albumId: string; assetHash: string }): string {
  const albumId = normalizeUuid(input.albumId, "albumId");
  const assetHash = normalizeSha256(input.assetHash, "assetHash");

  return `albums/${albumId}/artwork/${assetHash}.jpg`;
}

export function albumArtworkRef(input: { albumId: string; assetHash: string }): StoredObjectRef {
  return createStoredObjectRef(AIS_STORAGE_BUCKETS.albumArtwork, albumArtworkObjectPath(input));
}
