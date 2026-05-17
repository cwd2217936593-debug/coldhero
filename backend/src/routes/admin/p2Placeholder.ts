/**
 * P2 模块统一 501 响应（提示词 Step 9）
 */

import type { RequestHandler } from "express";

/** JSON 中带 `module` 便于网关/前端区分是哪条占位子路由 */
export function p2PlaceholderHandler(module: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({
      success: false,
      code: "NOT_IMPLEMENTED",
      message: `P2「${module}」尚未实现（Step 9 占位）`,
      module,
    });
  };
}
