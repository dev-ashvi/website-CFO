import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runWyzAiBenchmark, loadContextForFixture } from "./runner.js";
import { WYZ_AI_EVAL_CASES } from "./evalCases.js";
import { rankBenchmarkCandidates } from "./scorers.js";

describe("wyzAiBenchmark runner", () => {
  it("loads scenario fixtures into FinancialIntelligenceContext", () => {
    const s1 = loadContextForFixture("scenario1");
    assert.equal(s1.runway.primaryRunwayMonths, 12.3);

    const s4 = loadContextForFixture("scenario4");
    assert.equal(s4.runway.runwayBeforePlannedFundingMonths, 7.9);
    assert.equal(s4.runway.runwayAfterPlannedFundingMonths, 20.4);
  });

  it("runs mock benchmark without live providers", async () => {
    const result = await runWyzAiBenchmark({
      useMock: true,
      providerIds: ["mock"],
      evalCases: WYZ_AI_EVAL_CASES.slice(0, 3),
    });

    assert.equal(result.evalCaseCount, 3);
    assert.equal(result.candidateCount, 1);
    assert.ok(result.ranked.length >= 1);
    assert.ok(result.report.includes("mock"));
  });

  it("gating failures rank below passing candidates", () => {
    const ranked = rankBenchmarkCandidates([
      {
        providerId: "cheap",
        modelId: "m1",
        caseScores: [{ gatingPassed: true, normalizedScore: 0.8 }],
        avgCostUsd: 0.001,
        avgLatencyMs: 100,
      },
      {
        providerId: "bad",
        modelId: "m2",
        caseScores: [{ gatingPassed: false, normalizedScore: 0.99 }],
        avgCostUsd: 0.0001,
        avgLatencyMs: 50,
      },
    ]);

    assert.equal(ranked[0].providerId, "cheap");
    assert.equal(ranked[0].allGatingPassed, true);
  });
});
