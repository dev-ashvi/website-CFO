#!/usr/bin/env node
/**
 * BeautyCo AI CFO evaluation / model benchmark.
 *
 * Offline (fake model, no network/API key) — default:
 *   npm run eval:beautyco-ai-cfo
 *
 * Live OpenAI-compatible (NVIDIA NIM, etc.):
 *   npm run eval:beautyco-ai-cfo -- --live
 *   npm run eval:beautyco-ai-cfo -- --live --models "openai/gpt-oss-20b,meta/llama-3.3-70b-instruct"
 *   npm run eval:beautyco-ai-cfo -- --live --limit=1
 *   npm run eval:beautyco-ai-cfo -- --live --smoke
 *
 * Note: prefer --limit=1 (equals form). Plain `--limit 1` can be swallowed by npm as an npm config flag.
 *
 * Or call Python directly (clearest on Windows):
 *   python -m wyz_analytics.ai_cfo.benchmark --live --models "openai/gpt-oss-20b" --limit 1
 *
 * PowerShell setup (prefer ignored env file over putting keys in history):
 *   $env:WYZ_AI_CFO_PROVIDER = "openai_compatible"
 *   $env:WYZ_AI_CFO_BASE_URL = "https://integrate.api.nvidia.com/v1"
 *   $env:WYZ_AI_CFO_API_KEY = $env:NVIDIA_API_KEY
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { buildPythonBenchmarkArgv, buildPythonSpawnArgs } from "./evalBeautycoAiCfoArgs.js";

const nodeArgs = process.argv.slice(2);
const pythonArgv = buildPythonBenchmarkArgv(nodeArgs);
const spawnArgs = buildPythonSpawnArgs(pythonArgv);

const analyticsSrc = join(process.cwd(), "services", "analytics", "src");
const analyticsRoot = join(process.cwd(), "services", "analytics");

const env = {
  ...process.env,
  PYTHONPATH: [analyticsSrc, process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":"),
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
};

const child = spawn("python", spawnArgs, {
  env,
  stdio: "inherit",
  cwd: analyticsRoot,
});

child.on("exit", (code) => process.exit(code ?? 1));
