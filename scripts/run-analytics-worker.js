import { spawn } from "node:child_process";
import { resolve } from "node:path";

const src = resolve(process.cwd(), "services", "analytics", "src");
const workDir = resolve(process.cwd(), "services", "analytics", ".wyz-analytics-work");
const env = {
  ...process.env,
  // Keep local Windows development on the development security profile unless overridden.
  WYZ_ENV: process.env.WYZ_ENV || "development",
  WYZ_WORKSPACE_ID: process.env.WYZ_WORKSPACE_ID || "local",
  PYTHONPATH: src,
  WYZ_ANALYTICS_WORK_DIR: workDir,
  WYZ_ANALYTICS_WORKER_ID: process.env.WYZ_ANALYTICS_WORKER_ID || "local-worker",
};
console.log(`[analytics-worker] work_dir=${workDir}`);
const child = spawn("python", ["-m", "wyz_analytics.workers.local_http"], {
  env,
  stdio: "inherit",
  cwd: process.cwd(),
});
child.on("exit", (code) => process.exit(code ?? 1));
