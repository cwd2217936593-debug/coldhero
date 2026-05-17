/**
 * quotaDayRollover 调度偏移（纯单元；不连 Redis）。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeMsUntilNextQuotaRollover } from "@/utils/time";

describe("computeMsUntilNextQuotaRollover", () => {
  it("返回值在合法区间 (>0 且不会超过 7d 封顶)", () => {
    const ms = computeMsUntilNextQuotaRollover();
    assert.ok(ms >= 2000);
    assert.ok(ms <= 7 * 24 * 60 * 60 * 1000);
  });

  it("固定 now 仍能算出有限延迟（不抛异常）", () => {
    const anchor = Date.UTC(2030, 0, 15, 12, 0, 0);
    const ms = computeMsUntilNextQuotaRollover(anchor);
    assert.ok(Number.isFinite(ms));
    assert.ok(ms >= 2000);
  });
});
