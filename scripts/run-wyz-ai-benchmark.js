#!/usr/bin/env node
/** Optional offline/CI benchmark — uses mock unless API keys are set and --live is passed. */

import { runWyzAiBenchmark } from "../src/lib/ai/wyzAiBenchmark/runner.js";

const live = process.argv.includes("--live");

const result = await runWyzAiBenchmark({
  useMock: !live,
  providerIds: live ? ["openai", "deepseek", "qwen"] : ["mock"],
});

console.log("WYZ AI CFO Benchmark");
console.log("====================");
console.log(`Mode: ${live ? "live" : "mock"}`);
console.log(`Cases: ${result.evalCaseCount}`);
console.log(result.report);
console.log("\nDone.");
