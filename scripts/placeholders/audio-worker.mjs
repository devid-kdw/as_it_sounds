import { runAudioWorkerCli } from "../../workers/audio/index.mjs";

const result = await runAudioWorkerCli();
process.exitCode = result.exitCode;
