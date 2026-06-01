import { spawn } from "node:child_process";

import { AudioProcessingError } from "./errors.mjs";

export async function runAudioCommand({
  command,
  args = [],
  cwd,
  timeoutMs = 120_000,
  spawnImpl = spawn,
  errorCode = "UNKNOWN_PROCESSING_ERROR",
  errorMessage = "Audio command failed.",
} = {}) {
  if (!command) {
    throw new AudioProcessingError(errorCode, "Audio command path is missing.", { command, args });
  }

  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      reject(new AudioProcessingError("WORKER_TIMEOUT", "Audio command timed out.", {
        command,
        args,
        timeout_ms: timeoutMs,
      }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(new AudioProcessingError(errorCode, errorMessage, {
        command,
        args,
        system_error: error.message,
      }));
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

export async function runCheckedAudioCommand({
  errorCode,
  errorMessage,
  ...options
}) {
  const result = await runAudioCommand({ ...options, errorCode, errorMessage });

  if (result.exitCode !== 0) {
    throw new AudioProcessingError(errorCode, errorMessage, {
      command: options.command,
      args: options.args ?? [],
      exit_code: result.exitCode,
      signal: result.signal,
      stderr: trimCommandOutput(result.stderr),
    });
  }

  return result;
}

export function trimCommandOutput(output, maxLength = 4000) {
  const text = String(output ?? "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

