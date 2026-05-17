/**
 * 故障报告业务编排
 * --------------------------------
 * - submit：写库 → 异步触发 AI 分析 → 写回 DB → 推送通知
 * - list / detail：根据角色裁剪可见范围（普通用户仅看自己；admin/operator 看全部）
 * - 状态流转：pending → processing → closed，仅 admin/operator/handler 可操作
 */

import { faultRepo } from "@/modules/fault/fault.repository";
import { faultAi } from "@/modules/fault/fault.ai";
import { notificationsRepo } from "@/modules/notifications/notifications.repository";
import { runFaultDispatch } from "@/services/dispatchEngine";
import { ForbiddenError, NotFoundError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import type { AuthUser } from "@/types/express";
import type { FaultImage, FaultReport, FaultSeverity, FaultStatus } from "@/modules/fault/fault.types";

export interface SubmitFaultDto {
  zoneId: number | null;
  faultType: string;
  title: string;
  description: string;
  imageUrls: FaultImage[];
  severity?: FaultSeverity;
}

export const faultService = {
  /** 创建故障报告：先写一条 pending 记录，再异步跑 AI 分析 */
  async submit(user: AuthUser, dto: SubmitFaultDto): Promise<FaultReport> {
    const id = await faultRepo.create({
      userId: user.id,
      zoneId: dto.zoneId ?? null,
      faultType: dto.faultType,
      title: dto.title,
      description: dto.description,
      imageUrls: dto.imageUrls,
      severity: dto.severity ?? "medium",
    });
    const report = await faultRepo.findById(id);

    /**
     * 提示词 Step 5：`fault_reports` 落库成功后异步触发自动派单引擎（不阻塞响应、不冒泡错误）。
     * 实现见 `services/dispatchEngine.ts`。
     */
    void runFaultDispatch({ faultId: id, customerUserId: user.id });

    // 异步 AI 分析（不阻塞响应；失败仅记录日志）
    void (async () => {
      try {
        const ai = await faultAi.analyze({
          zoneId: dto.zoneId ?? null,
          faultType: dto.faultType,
          title: dto.title,
          description: dto.description,
          images: dto.imageUrls,
        });
        const overrideSev = ai.severity && (!dto.severity || severityRank(ai.severity) > severityRank(dto.severity)) ? ai.severity : undefined;
        await faultRepo.setAiAnalysis(id, ai.text, overrideSev);
        await notificationsRepo.create({
          userId: user.id,
          type: "fault",
          title: `故障报告 #${id} 已生成 AI 初步分析`,
          content: dto.title,
          payload: { faultId: id, severity: overrideSev ?? dto.severity ?? "medium", urgency: ai.structured?.urgency ?? null },
        });
      } catch (err) {
        logger.error({ err, faultId: id }, "AI 故障分析失败");
        await faultRepo.setAiAnalysis(id, `> AI 分析失败：${(err as Error).message}`).catch(() => {});
      }
    })();

    return report!;
  },

  async list(viewer: AuthUser, opts: {
    status?: FaultStatus;
    severity?: FaultSeverity;
    zoneId?: number;
    keyword?: string;
    mine?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ items: FaultReport[]; total: number; page: number; pageSize: number }> {
    const isAdmin = viewer.role === "admin" || viewer.role === "operator";
    // 普通用户强制只看自己；mine=true 时无论身份都只看自己
    const onlyMine = !isAdmin || opts.mine === true;
    const offset = (opts.page - 1) * opts.pageSize;
    const { items, total } = await faultRepo.list({
      userId: onlyMine ? viewer.id : undefined,
      status: opts.status,
      severity: opts.severity,
      zoneId: opts.zoneId,
      keyword: opts.keyword,
      limit: opts.pageSize,
      offset,
    });
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  },

  async detail(viewer: AuthUser, id: number): Promise<FaultReport> {
    const r = await faultRepo.findById(id);
    if (!r) throw new NotFoundError("故障报告不存在");
    const isAdmin = viewer.role === "admin" || viewer.role === "operator";
    if (!isAdmin && r.userId !== viewer.id) throw new ForbiddenError("无权查看此故障报告");
    return r;
  },

  async updateStatus(viewer: AuthUser, id: number, patch: {
    status?: FaultStatus;
    severity?: FaultSeverity;
    handlerId?: number | null;
    handlerNote?: string | null;
  }): Promise<FaultReport> {
    const r = await faultRepo.findById(id);
    if (!r) throw new NotFoundError("故障报告不存在");
    const isAdmin = viewer.role === "admin" || viewer.role === "operator";
    if (!isAdmin) throw new ForbiddenError("仅管理员/运维可操作");
    await faultRepo.updateStatus(id, patch);
    if (patch.status && patch.status !== r.status) {
      await notificationsRepo.create({
        userId: r.userId,
        type: "fault",
        title: `故障报告 #${id} 状态变更：${r.status} → ${patch.status}`,
        content: r.title,
        payload: { faultId: id, by: viewer.id },
      });
    }
    return (await faultRepo.findById(id))!;
  },

  async remove(viewer: AuthUser, id: number): Promise<void> {
    const r = await faultRepo.findById(id);
    if (!r) throw new NotFoundError("故障报告不存在");
    const isAdmin = viewer.role === "admin";
    if (!isAdmin && r.userId !== viewer.id) throw new ForbiddenError("仅本人或管理员可删除");
    await faultRepo.remove(id);
  },
};

function severityRank(s: FaultSeverity): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[s];
}
