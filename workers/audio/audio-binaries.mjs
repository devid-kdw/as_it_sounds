import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import { AudioWorkerConfigurationError } from "./errors.mjs";

const BINARY_SPECS = Object.freeze({
  ffmpeg: {
    envVar: "AIS_FFMPEG_PATH",
    executable: "ffmpeg",
    pinnedCandidates: ["workers/audio/bin/ffmpeg", "bin/ffmpeg", ".local/bin/ffmpeg", "node_modules/.bin/ffmpeg"],
  },
  ffprobe: {
    envVar: "AIS_FFPROBE_PATH",
    executable: "ffprobe",
    pinnedCandidates: ["workers/audio/bin/ffprobe", "bin/ffprobe", ".local/bin/ffprobe", "node_modules/.bin/ffprobe"],
  },
  audiowaveform: {
    envVar: "AIS_AUDIOWAVEFORM_PATH",
    executable: "audiowaveform",
    pinnedCandidates: [
      "workers/audio/bin/audiowaveform",
      "bin/audiowaveform",
      ".local/bin/audiowaveform",
      "node_modules/.bin/audiowaveform",
    ],
  },
});

export async function resolveAudioBinaries({
  env = process.env,
  projectRoot = process.cwd(),
  binaryMode = env.AIS_AUDIO_BINARY_MODE?.trim() || "pinned",
  required = ["ffmpeg", "ffprobe", "audiowaveform"],
} = {}) {
  if (!["explicit", "pinned", "system"].includes(binaryMode)) {
    throw new AudioWorkerConfigurationError("AIS_AUDIO_BINARY_MODE must be 'explicit', 'pinned', or 'system'.", {
      AIS_AUDIO_BINARY_MODE: binaryMode,
    });
  }

  const entries = {};
  const missing = [];

  for (const name of required) {
    const spec = BINARY_SPECS[name];

    if (!spec) {
      throw new AudioWorkerConfigurationError(`Unknown audio binary '${name}'.`, { binary: name });
    }

    const resolved = await resolveOneBinary({ name, spec, env, projectRoot, binaryMode });
    entries[name] = resolved;

    if (!resolved.path) {
      missing.push(resolved);
    }
  }

  return Object.freeze({
    ok: missing.length === 0,
    binaryMode,
    binaries: Object.freeze(entries),
    missing: Object.freeze(missing),
  });
}

export async function requireAudioBinaries(options = {}) {
  const resolution = await resolveAudioBinaries(options);

  if (!resolution.ok) {
    throw new AudioWorkerConfigurationError("Required audio binaries are missing or not executable.", {
      binary_mode: resolution.binaryMode,
      missing: resolution.missing.map(({ name, envVar, attempted }) => ({ name, envVar, attempted })),
    });
  }

  return resolution;
}

export const resolveRequiredAudioBinaries = requireAudioBinaries;
export const resolveAudioWorkerBinaries = resolveAudioBinaries;

export function toBinaryConfigurationLog(resolution) {
  const binaries = {};

  for (const [name, entry] of Object.entries(resolution.binaries)) {
    binaries[name] = {
      path: entry.path,
      source: entry.source,
      env_var: entry.envVar,
      required: true,
    };
  }

  return {
    binary_mode: resolution.binaryMode,
    ok: resolution.ok,
    binaries,
    missing: resolution.missing.map((entry) => ({
      name: entry.name,
      env_var: entry.envVar,
      attempted: entry.attempted,
    })),
  };
}

async function resolveOneBinary({ name, spec, env, projectRoot, binaryMode }) {
  const attempted = [];
  const explicitPath = env[spec.envVar]?.trim();

  if (explicitPath) {
    const resolvedPath = path.resolve(projectRoot, explicitPath);
    attempted.push({ source: "env", path: resolvedPath });

    if (await isExecutable(resolvedPath)) {
      return freezeResolution({ name, path: resolvedPath, source: "env", envVar: spec.envVar, attempted });
    }

    return freezeResolution({ name, path: null, source: null, envVar: spec.envVar, attempted });
  }

  for (const candidate of spec.pinnedCandidates) {
    const candidatePath = path.resolve(projectRoot, candidate);
    attempted.push({ source: "project-pinned", path: candidatePath });

    if (await isExecutable(candidatePath)) {
      return freezeResolution({
        name,
        path: candidatePath,
        source: "project-pinned",
        envVar: spec.envVar,
        attempted,
      });
    }
  }

  if (binaryMode === "system") {
    const systemPath = await findOnPath(spec.executable, env.PATH);
    attempted.push({ source: "system", path: systemPath ?? spec.executable });

    if (systemPath) {
      return freezeResolution({ name, path: systemPath, source: "system", envVar: spec.envVar, attempted });
    }
  }

  return freezeResolution({ name, path: null, source: null, envVar: spec.envVar, attempted });
}

async function findOnPath(executable, pathValue = "") {
  const searchPaths = pathValue.split(path.delimiter).filter(Boolean);

  for (const directory of searchPaths) {
    const candidate = path.join(directory, executable);

    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function freezeResolution({ name, path: binaryPath, source, envVar, attempted }) {
  return Object.freeze({
    name,
    path: binaryPath,
    source,
    envVar,
    attempted: Object.freeze(attempted.map((entry) => Object.freeze(entry))),
  });
}
