import "server-only";

import type { SupabaseDatabaseClient } from "./supabase/admin";
import { createSupabaseAdminClient } from "./supabase/admin";
import {
  AIS_STORAGE_BUCKETS,
  assertStorageBucketName,
  isPrivateStorageBucket,
  normalizeStorageObjectPath,
  type StoredObjectRef,
} from "./storage-paths";

export * from "./storage-paths";

export type AssetKind = "preview_audio" | "waveform_peaks" | "original_wav" | "album_artwork";

export type SignedUploadTarget = {
  bucket: string;
  objectPath: string;
  url: string;
  token: string;
  expiresAt?: string;
};

export type SignedDownloadOptions = {
  download?: string | boolean;
};

export type StorageUploadBody =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | Buffer
  | File
  | FormData
  | NodeJS.ReadableStream
  | ReadableStream<Uint8Array>
  | URLSearchParams
  | string;

export type UploadOptions = {
  cacheControl?: string;
  contentType?: string;
  duplex?: string;
  metadata?: Record<string, unknown>;
  upsert?: boolean;
};

export type SignedUploadOptions = {
  upsert?: boolean;
};

export interface StorageProvider {
  createSignedUploadUrl(
    ref: StoredObjectRef,
    expiresInSeconds?: number,
    options?: SignedUploadOptions,
  ): Promise<SignedUploadTarget>;
  createSignedDownloadUrl(
    ref: StoredObjectRef,
    expiresInSeconds: number,
    options?: SignedDownloadOptions,
  ): Promise<string>;
  getPublicUrl(ref: StoredObjectRef): string;
  exists(ref: StoredObjectRef): Promise<boolean>;
  uploadObject(ref: StoredObjectRef, body: StorageUploadBody, options?: UploadOptions): Promise<void>;
  downloadObject(ref: StoredObjectRef): Promise<ArrayBuffer>;
  copyObject(source: StoredObjectRef, destination: StoredObjectRef): Promise<void>;
  deleteObject(ref: StoredObjectRef): Promise<void>;
}

const DEFAULT_SIGNED_UPLOAD_EXPIRES_IN_SECONDS = 60 * 60 * 2;
const MIN_ORIGINAL_DOWNLOAD_EXPIRES_IN_SECONDS = 60;
const MAX_ORIGINAL_DOWNLOAD_EXPIRES_IN_SECONDS = 300;

export function assertPublicAssetKind(kind: AssetKind) {
  if (kind === "original_wav") {
    throw new Error("Original WAV assets must never be exposed through public asset helpers.");
  }
}

export function assertPublicStorageRef(ref: StoredObjectRef) {
  const safeRef = normalizeRef(ref);

  if (isPrivateStorageBucket(safeRef.bucket)) {
    throw new Error(`Storage bucket ${safeRef.bucket} is private and cannot be exposed through public URL helpers.`);
  }
}

export class SupabaseStorageProvider implements StorageProvider {
  constructor(private readonly client: SupabaseDatabaseClient = createSupabaseAdminClient()) {}

  async createSignedUploadUrl(
    ref: StoredObjectRef,
    expiresInSeconds?: number,
    options: SignedUploadOptions = {},
  ): Promise<SignedUploadTarget> {
    const safeRef = normalizeRef(ref);
    const effectiveExpiresInSeconds = expiresInSeconds ?? DEFAULT_SIGNED_UPLOAD_EXPIRES_IN_SECONDS;
    const { data, error } = await this.client.storage
      .from(safeRef.bucket)
      .createSignedUploadUrl(safeRef.objectPath, { upsert: options.upsert ?? false });

    if (error) {
      throwStorageError("create signed upload URL", safeRef, error);
    }

    return {
      bucket: safeRef.bucket,
      objectPath: safeRef.objectPath,
      url: data.signedUrl,
      token: data.token,
      expiresAt: new Date(Date.now() + effectiveExpiresInSeconds * 1000).toISOString(),
    };
  }

  async createSignedDownloadUrl(
    ref: StoredObjectRef,
    expiresInSeconds: number,
    options: SignedDownloadOptions = {},
  ): Promise<string> {
    const safeRef = normalizeRef(ref);

    assertSignedDownloadExpiration(safeRef, expiresInSeconds);

    const { data, error } = await this.client.storage
      .from(safeRef.bucket)
      .createSignedUrl(safeRef.objectPath, expiresInSeconds, options);

    if (error) {
      throwStorageError("create signed download URL", safeRef, error);
    }

    return data.signedUrl;
  }

  getPublicUrl(ref: StoredObjectRef): string {
    const safeRef = normalizeRef(ref);

    assertPublicStorageRef(safeRef);

    const { data } = this.client.storage.from(safeRef.bucket).getPublicUrl(safeRef.objectPath);
    return data.publicUrl;
  }

  async exists(ref: StoredObjectRef): Promise<boolean> {
    const safeRef = normalizeRef(ref);
    const { directory, filename } = splitObjectPath(safeRef.objectPath);
    const { data, error } = await this.client.storage.from(safeRef.bucket).list(directory, {
      limit: 100,
      search: filename,
    });

    if (error) {
      throwStorageError("check object existence", safeRef, error);
    }

    return data.some((object) => object.name === filename && object.id !== null);
  }

  async uploadObject(ref: StoredObjectRef, body: StorageUploadBody, options: UploadOptions = {}): Promise<void> {
    const safeRef = normalizeRef(ref);
    const { error } = await this.client.storage.from(safeRef.bucket).upload(safeRef.objectPath, body, {
      cacheControl: options.cacheControl,
      contentType: options.contentType,
      duplex: options.duplex,
      metadata: options.metadata,
      upsert: options.upsert ?? false,
    });

    if (error) {
      throwStorageError("upload object", safeRef, error);
    }
  }

  async downloadObject(ref: StoredObjectRef): Promise<ArrayBuffer> {
    const safeRef = normalizeRef(ref);
    const { data, error } = await this.client.storage.from(safeRef.bucket).download(safeRef.objectPath);

    if (error) {
      throwStorageError("download object", safeRef, error);
    }

    return data.arrayBuffer();
  }

  async copyObject(source: StoredObjectRef, destination: StoredObjectRef): Promise<void> {
    const safeSource = normalizeRef(source);
    const safeDestination = normalizeRef(destination);
    const { error } = await this.client.storage.from(safeSource.bucket).copy(safeSource.objectPath, safeDestination.objectPath, {
      destinationBucket: safeDestination.bucket,
    });

    if (error) {
      throwStorageError("copy object", safeDestination, error);
    }
  }

  async deleteObject(ref: StoredObjectRef): Promise<void> {
    const safeRef = normalizeRef(ref);
    const { error } = await this.client.storage.from(safeRef.bucket).remove([safeRef.objectPath]);

    if (error) {
      throwStorageError("delete object", safeRef, error);
    }
  }
}

export function createStorageProvider(client?: SupabaseDatabaseClient): StorageProvider {
  return new SupabaseStorageProvider(client);
}

export function createSupabaseStorageProvider(client?: SupabaseDatabaseClient): SupabaseStorageProvider {
  return new SupabaseStorageProvider(client);
}

export function createDefaultStorageProvider(): StorageProvider {
  return createStorageProvider();
}

export function isOriginalStorageRef(ref: StoredObjectRef): boolean {
  const safeRef = normalizeRef(ref);

  return safeRef.bucket === AIS_STORAGE_BUCKETS.originals;
}

function normalizeRef(ref: StoredObjectRef): StoredObjectRef {
  return {
    bucket: assertStorageBucketName(ref.bucket),
    objectPath: normalizeStorageObjectPath(ref.objectPath),
  };
}

function splitObjectPath(objectPath: string): { directory: string; filename: string } {
  const separatorIndex = objectPath.lastIndexOf("/");

  if (separatorIndex === -1) {
    return { directory: "", filename: objectPath };
  }

  return {
    directory: objectPath.slice(0, separatorIndex),
    filename: objectPath.slice(separatorIndex + 1),
  };
}

function assertSignedDownloadExpiration(ref: StoredObjectRef, expiresInSeconds: number) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("Signed download URL expiration must be a positive whole number of seconds.");
  }

  if (
    ref.bucket === AIS_STORAGE_BUCKETS.originals &&
    (expiresInSeconds < MIN_ORIGINAL_DOWNLOAD_EXPIRES_IN_SECONDS ||
      expiresInSeconds > MAX_ORIGINAL_DOWNLOAD_EXPIRES_IN_SECONDS)
  ) {
    throw new Error("Original WAV signed download URLs must expire between 60 and 300 seconds.");
  }
}

function throwStorageError(action: string, ref: StoredObjectRef, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  throw new Error(`Storage failed to ${action} for ${ref.bucket}/${ref.objectPath}: ${message}`);
}
