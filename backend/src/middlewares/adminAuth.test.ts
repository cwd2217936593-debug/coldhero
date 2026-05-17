/**
 * 管理员角色校验单元测试（node:test + tsx）
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { ForbiddenError } from "@/utils/errors";
import { isPlatformAdminRole, requireAdminAuth, requireStrictAdminAuth } from "./adminAuth";

const noopRes = {} as Response;

describe("isPlatformAdminRole", () => {
  it("允许 admin / operator", () => {
    assert.equal(isPlatformAdminRole("admin"), true);
    assert.equal(isPlatformAdminRole("operator"), true);
  });

  it("拒绝 viewer", () => {
    assert.equal(isPlatformAdminRole("viewer"), false);
  });
});

describe("requireAdminAuth", () => {
  const adminUser = {
    id: 1,
    username: "ops",
    role: "admin" as const,
    memberLevel: "free" as const,
  };

  it("已登录且为管理员时调用 next", () => {
    let nextCalls = 0;
    const req = { user: adminUser } as Request;
    requireAdminAuth(req, noopRes, () => {
      nextCalls += 1;
    });
    assert.equal(nextCalls, 1);
  });

  it("未登录时 403 + FORBIDDEN + 无管理员权限", () => {
    const req = {} as Request;
    assert.throws(
      () => requireAdminAuth(req, noopRes, () => {}),
      (e: unknown) =>
        e instanceof ForbiddenError && e.code === "FORBIDDEN" && e.message === "无管理员权限",
    );
  });

  it("viewer 角色时拒绝", () => {
    const req = {
      user: { ...adminUser, role: "viewer" as const },
    } as Request;
    assert.throws(
      () => requireAdminAuth(req, noopRes, () => {}),
      (e: unknown) => e instanceof ForbiddenError && e.code === "FORBIDDEN",
    );
  });
});

describe("requireStrictAdminAuth", () => {
  const base = {
    id: 1,
    username: "u",
    memberLevel: "free" as const,
  };

  it("operator 拒绝", () => {
    const req = { user: { ...base, role: "operator" as const } } as Request;
    assert.throws(
      () => requireStrictAdminAuth(req, noopRes, () => {}),
      (e: unknown) => e instanceof ForbiddenError && e.code === "FORBIDDEN",
    );
  });

  it("admin 通过", () => {
    let n = 0;
    const req = { user: { ...base, role: "admin" as const } } as Request;
    requireStrictAdminAuth(req, noopRes, () => {
      n += 1;
    });
    assert.equal(n, 1);
  });
});
