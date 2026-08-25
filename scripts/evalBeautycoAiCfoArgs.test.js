import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPythonBenchmarkArgv,
  buildPythonSpawnArgs,
  recoverNpmConfigFlags,
  resolvePythonCommand,
} from "./evalBeautycoAiCfoArgs.js";

describe("eval-beautyco-ai-cfo argument forwarding", () => {
  it("forwards empty args for offline default", () => {
    assert.deepEqual(buildPythonBenchmarkArgv([]), []);
    assert.deepEqual(buildPythonSpawnArgs([]), ["-m", "wyz_analytics.ai_cfo.benchmark"]);
    assert.equal(resolvePythonCommand([]), "python -m wyz_analytics.ai_cfo.benchmark");
  });

  it("forwards --live alone", () => {
    assert.deepEqual(buildPythonBenchmarkArgv(["--live"]), ["--live"]);
    assert.equal(
      resolvePythonCommand(["--live"]),
      "python -m wyz_analytics.ai_cfo.benchmark --live",
    );
  });

  it("keeps --models as a single comma-separated value", () => {
    const argv = buildPythonBenchmarkArgv([
      "--live",
      "--models",
      "openai/gpt-oss-20b,meta/llama-3.3-70b-instruct",
    ]);
    assert.deepEqual(argv, [
      "--live",
      "--models",
      "openai/gpt-oss-20b,meta/llama-3.3-70b-instruct",
    ]);
  });

  it("rejoins model ids if npm/shell split on commas", () => {
    const argv = buildPythonBenchmarkArgv([
      "--live",
      "--models",
      "openai/gpt-oss-20b",
      "meta/llama-3.3-70b-instruct",
    ]);
    assert.deepEqual(argv, [
      "--live",
      "--models",
      "openai/gpt-oss-20b,meta/llama-3.3-70b-instruct",
    ]);
  });

  it("supports --models=value and --limit=value forms", () => {
    assert.deepEqual(
      buildPythonBenchmarkArgv(["--live", "--models=openai/gpt-oss-20b", "--limit=1"]),
      ["--live", "--models", "openai/gpt-oss-20b", "--limit", "1"],
    );
  });

  it("does not invent positional model arguments", () => {
    const spawnArgs = buildPythonSpawnArgs(
      buildPythonBenchmarkArgv([
        "--live",
        "--models",
        "openai/gpt-oss-20b",
        "meta/llama-3.3-70b-instruct",
      ]),
    );
    assert.deepEqual(spawnArgs, [
      "-m",
      "wyz_analytics.ai_cfo.benchmark",
      "--live",
      "--models",
      "openai/gpt-oss-20b,meta/llama-3.3-70b-instruct",
    ]);
  });

  it("recovers --limit when npm leaves a bare number", () => {
    assert.deepEqual(buildPythonBenchmarkArgv(["1"]), ["--limit", "1"]);
    assert.deepEqual(buildPythonBenchmarkArgv(["--live", "1"]), ["--live", "--limit", "1"]);
  });

  it("recovers npm_config_limit env", () => {
    assert.deepEqual(
      recoverNpmConfigFlags(["--live"], { npm_config_limit: "1" }),
      ["--live", "--limit", "1"],
    );
    assert.deepEqual(
      recoverNpmConfigFlags(["1"], { npm_config_limit: "1" }),
      ["--limit", "1"],
    );
  });
});
