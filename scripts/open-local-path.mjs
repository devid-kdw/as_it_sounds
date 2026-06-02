import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const target = process.argv[2] ?? "library";
const localRoot = path.resolve(process.env.AIS_LOCAL_LIBRARY_DIR ?? path.join(os.homedir(), "Music", "As It Sounds"));

const targets = {
  library: localRoot,
  dropzone: path.resolve(process.env.AIS_LOCAL_DROPZONE_DIR ?? path.join(localRoot, "fl_dropzone")),
  cache: path.resolve(process.env.AIS_LOCAL_CACHE_DIR ?? path.join(localRoot, "cache")),
};

const targetPath = targets[target];

if (!targetPath) {
  console.error(`Unknown AIS local path target: ${target}`);
  process.exit(2);
}

if (!existsSync(targetPath)) {
  console.error(`AIS local path does not exist: ${targetPath}`);
  process.exit(1);
}

const [command, args] =
  process.platform === "darwin"
    ? ["open", [targetPath]]
    : process.platform === "win32"
      ? ["explorer", [targetPath]]
      : ["xdg-open", [targetPath]];

const child = spawn(command, args, {
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Unable to open AIS local path: ${error.message}`);
  process.exit(1);
});
