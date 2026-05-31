import "server-only";

import { z } from "zod";
import type { UploadSessionCreateRequest } from "@/types/api";
import { AISUserSafeError } from "@/lib/errors";
import { poeticNameSchema } from "@/lib/validators";

export const UPLOAD_SESSION_BUCKET = "ais-processing-temp";
export const UPLOAD_SESSION_URL_TTL_SECONDS = 15 * 60;
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

export const WAV_CONTENT_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
] as const;

const uploadSessionCreateSchema = z
  .object({
    mode: z.enum(["single", "bulk"]),
    filename: z.string().trim().min(1).max(255),
    content_type: z.string().trim().toLowerCase(),
    file_size_bytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
    category_slug: poeticNameSchema,
    sample_type_slug: poeticNameSchema,
    bpm: z.number().positive().max(400).nullable().optional(),
    batch_id: z.string().uuid().nullable().optional(),
    bulk_position: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (!isWavFilename(value.filename)) {
      context.addIssue({
        code: "custom",
        path: ["filename"],
        message: "Only .wav files are supported.",
      });
    }

    if (!isWavContentType(value.content_type)) {
      context.addIssue({
        code: "custom",
        path: ["content_type"],
        message: "Only WAV content types are supported.",
      });
    }

    if (value.sample_type_slug === "loop" && !value.bpm) {
      context.addIssue({
        code: "custom",
        path: ["bpm"],
        message: "Loop uploads require BPM at draft creation time.",
      });
    }

    if (value.mode === "single" && (value.batch_id || value.bulk_position)) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Single upload sessions cannot include bulk batch fields.",
      });
    }

    if (value.mode === "bulk" && (!value.batch_id || !value.bulk_position)) {
      context.addIssue({
        code: "custom",
        path: ["batch_id"],
        message: "Bulk upload sessions require a batch ID and position.",
      });
    }
  });

export function parseUploadSessionCreateRequest(payload: unknown): UploadSessionCreateRequest {
  const parsed = uploadSessionCreateSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(
      parsed.error.issues[0]?.message ?? "Invalid upload session request.",
      "invalid_upload_session_request",
      400,
    );
  }

  return parsed.data;
}

export function buildUploadSessionPath(sampleId: string, uploadSessionId: string) {
  return `intake/${sampleId}/${uploadSessionId}/source.wav`;
}

export function getSignedUploadExpiresAt(now = new Date()) {
  return new Date(now.getTime() + UPLOAD_SESSION_URL_TTL_SECONDS * 1000).toISOString();
}

export function isWavFilename(filename: string) {
  return /\.wav$/i.test(filename.trim());
}

export function isWavContentType(contentType: string) {
  return WAV_CONTENT_TYPES.includes(contentType.trim().toLowerCase() as (typeof WAV_CONTENT_TYPES)[number]);
}
