/**
 * Normalize Node CLI args before forwarding to the Python AI CFO benchmark.
 * npm/Windows shells may:
 * - split comma-separated --models values into separate argv tokens
 * - swallow known npm config flags such as --limit (leaving a bare number)
 */

const EQUALS_FLAGS = [
  "models",
  "limit",
  "question",
  "base-url",
  "out",
  "http-timeout",
  "question-timeout",
];

/**
 * Recover flags npm may have consumed into npm_config_* env vars.
 * @param {string[]} nodeArgs
 * @param {NodeJS.ProcessEnv} [env]
 */
export function recoverNpmConfigFlags(nodeArgs, env = process.env) {
  const out = Array.isArray(nodeArgs) ? [...nodeArgs.map(String)] : [];

  function hasFlag(name) {
    return out.includes(`--${name}`) || out.some((item) => item.startsWith(`--${name}=`));
  }

  const lim = env.npm_config_limit;
  if (!hasFlag("limit") && lim != null && lim !== "" && lim !== "true" && lim !== "false") {
    const bareIdx = out.findIndex((item) => item === String(lim));
    if (bareIdx >= 0) out.splice(bareIdx, 1);
    out.push("--limit", String(lim));
  } else if (!hasFlag("limit")) {
    // npm often leaves the value behind as a bare integer after eating --limit
    const bareIdx = out.findIndex((item) => /^\d+$/.test(item));
    if (bareIdx >= 0) {
      const prev = out[bareIdx - 1];
      const valueFlags = new Set([
        "--models",
        "--question",
        "--base-url",
        "--out",
        "--http-timeout",
        "--question-timeout",
      ]);
      if (!valueFlags.has(prev)) {
        const [value] = out.splice(bareIdx, 1);
        out.push("--limit", value);
      }
    }
  }

  return out;
}

/**
 * @param {string[]} nodeArgs process.argv.slice(2)
 * @returns {string[]} args for `python -m wyz_analytics.ai_cfo.benchmark ...`
 */
export function buildPythonBenchmarkArgv(nodeArgs) {
  const input = recoverNpmConfigFlags(Array.isArray(nodeArgs) ? nodeArgs.map(String) : []);
  const out = [];

  for (let i = 0; i < input.length; i += 1) {
    const arg = input[i];

    if (arg === "--models") {
      out.push("--models");
      const parts = [];
      let j = i + 1;
      while (j < input.length && !String(input[j]).startsWith("-")) {
        parts.push(String(input[j]));
        j += 1;
      }
      if (parts.length > 0) {
        out.push(parts.join(","));
      }
      i = j - 1;
      continue;
    }

    let matchedEquals = false;
    for (const name of EQUALS_FLAGS) {
      const prefix = `--${name}=`;
      if (arg.startsWith(prefix)) {
        out.push(`--${name}`);
        out.push(arg.slice(prefix.length));
        matchedEquals = true;
        break;
      }
    }
    if (matchedEquals) continue;

    out.push(arg);
  }

  return out;
}

/**
 * @param {string[]} pythonArgv result of buildPythonBenchmarkArgv
 * @returns {string[]} full python process argv (excluding executable)
 */
export function buildPythonSpawnArgs(pythonArgv) {
  return ["-m", "wyz_analytics.ai_cfo.benchmark", ...pythonArgv];
}

/**
 * Human-readable resolved command for docs / debugging.
 * @param {string[]} nodeArgs
 * @returns {string}
 */
export function resolvePythonCommand(nodeArgs) {
  const spawnArgs = buildPythonSpawnArgs(buildPythonBenchmarkArgv(nodeArgs));
  return ["python", ...spawnArgs.map(quoteArg)].join(" ");
}

function quoteArg(value) {
  const text = String(value);
  if (text === "") return '""';
  if (/[\s"]/.test(text) || text.includes(",")) {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return text;
}
