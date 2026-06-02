import { NextRequest, NextResponse } from "next/server";
import { AccessConfigError, getEntitlementForCurrentUser } from "@/lib/entitlement";
import { AISUserSafeError } from "@/lib/errors";
import { createStorageProvider, type StoredObjectRef } from "@/lib/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type DownloadRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

type DownloadSource = Database["public"]["Enums"]["download_source"];

type DownloadSampleRow = {
  id: string;
  status: Database["public"]["Enums"]["sample_status"];
  display_title: string;
};

type OriginalAssetRow = {
  [Key in "bucket" | "object_path" | "updated_at"]: string;
} & Record<"checksum_sha256", string | null>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORIGINAL_DOWNLOAD_EXPIRES_IN_SECONDS = 120;
const PUBLISHED_SAMPLE_MATCH = { status: "published" } as const;

export async function GET(request: NextRequest, context: DownloadRouteContext) {
  try {
    const { sampleId } = await context.params;
    const normalizedSampleId = normalizeUuid(sampleId);
    const requestedSource = request.nextUrl.searchParams.get("source");
    const source: DownloadSource = requestedSource === "plugin" ? "plugin" : "web";
    const supabase = await createSupabaseServerClient();
    const entitlement = await getEntitlementForCurrentUser(supabase);

    if (!entitlement.isAuthenticated || !entitlement.userId) {
      throw new AISUserSafeError("Sign in to download original WAV files.", "not_authenticated", 401);
    }

    if (!entitlement.canDownloadOriginal || (source === "plugin" && !entitlement.canUsePlugin)) {
      throw new AISUserSafeError("Your account cannot download this sample.", "not_entitled", 403);
    }

    const admin = createSupabaseAdminClient();
    const sample = await getDownloadableSample(admin, normalizedSampleId);
    const originalAsset = await getOriginalWavAsset(admin, sample.id);
    const storage = createStorageProvider(admin);
    const expiresAt = new Date(Date.now() + ORIGINAL_DOWNLOAD_EXPIRES_IN_SECONDS * 1000).toISOString();
    const originalRef = Object.fromEntries([
      ["bucket", originalAsset.bucket],
      ["objectPath", originalAsset.object_path],
    ]) as StoredObjectRef;
    const url = await storage.createSignedDownloadUrl(
      originalRef,
      120,
      {
        download: buildDownloadFilename(sample),
      },
    );

    await logDownload(admin, {
      userId: entitlement.userId,
      sampleId: sample.id,
      source,
      subscriptionStatus: entitlement.subscriptionStatus,
      fileVersion: originalAsset.checksum_sha256 ?? originalAsset.updated_at,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      url,
      expiresAt,
    });
  } catch (error) {
    return downloadErrorResponse(error);
  }
}

async function getDownloadableSample(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sampleId: string,
): Promise<DownloadSampleRow> {
  const { data, error } = await admin
    .from("samples")
    .select("id,status,display_title")
    .eq("id", sampleId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the sample.", "sample_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Sample was not found.", "sample_not_found", 404);
  }

  if (data.status === "archived") {
    throw new AISUserSafeError("Sample is archived.", "sample_archived", 410);
  }

  if (data.status !== PUBLISHED_SAMPLE_MATCH.status) {
    throw new AISUserSafeError("Sample was not found.", "sample_not_found", 404);
  }

  return data as DownloadSampleRow;
}

async function getOriginalWavAsset(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sampleId: string,
): Promise<OriginalAssetRow> {
  const { data, error } = await admin
    .from("sample_assets")
    .select("bucket,object_path,checksum_sha256,updated_at")
    .eq("sample_id", sampleId)
    .eq("kind", "original_wav")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new AISUserSafeError("Unable to load the original WAV asset.", "original_asset_lookup_failed", 500);
  }

  const [asset] = (data ?? []) as OriginalAssetRow[];

  if (!asset) {
    throw new AISUserSafeError("Original WAV asset is missing.", "original_asset_missing", 409);
  }

  return asset;
}

async function logDownload(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    sampleId: string;
    source: DownloadSource;
    subscriptionStatus: Database["public"]["Enums"]["subscription_status"] | null;
    fileVersion: string | null;
    userAgent: string | null;
  },
) {
  const { error } = await admin.from("downloads").insert({
    user_id: input.userId,
    sample_id: input.sampleId,
    source: input.source,
    subscription_state_at_download: input.subscriptionStatus,
    file_version: input.fileVersion,
    user_agent: input.userAgent,
  });

  if (error) {
    throw new AISUserSafeError("Unable to log the download.", "download_log_failed", 500);
  }
}

function normalizeUuid(value: string) {
  const trimmed = value.trim();

  if (!UUID_PATTERN.test(trimmed)) {
    throw new AISUserSafeError("Sample ID must be a valid UUID.", "invalid_sample_id", 400);
  }

  return trimmed.toLowerCase();
}

function buildDownloadFilename(sample: Pick<DownloadSampleRow, "display_title" | "id">) {
  const title = sample.display_title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${title || sample.id}.wav`;
}

function downloadErrorResponse(error: unknown) {
  if (error instanceof AISUserSafeError) {
    if (error.code === "not_authenticated") {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        { status: 401 },
      );
    }

    if (error.code === "not_entitled") {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: error.message,
      },
      { status: error.status },
    );
  }

  if (error instanceof AccessConfigError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      code: "signed_url_failed",
      message: "Unable to create the download URL.",
    },
    { status: 500 },
  );
}
