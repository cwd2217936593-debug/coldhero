/**
 * 自动派单引擎（提示词 Step 5）
 * --------------------------------
 * 触发：`fault_reports` 写入成功后，由 `fault.service.submit` **异步**调用 `runFaultDispatch`；
 * 引擎内部 try/catch，失败只打 error log，**不改变**提交故障的 HTTP 结果。
 *
 * 会员等级（DB `member_level`）：`professional` / `enterprise` 可走自动派单链路。
 *
 * - Step 3a **free / basic**：不建 `work_orders`，仅 `notify.send` → 全体 **ops_admin**
 *  （实现为 `users.role = 'admin'`）类型 **`fault_new`**。
 * - Step 1–2 **professional / enterprise**：
 *   - Step 1：事务内 `SELECT … FROM technician_status … FOR UPDATE`，
 *     且 **`JOIN users` 限定 `role = 'operator'`**、账号启用，按 `updated_at` 取最久未动的一条空闲。
 *   - Step 2A 有空闲：`INSERT work_orders`（`assigned` + `auto_assigned=1`）、
 *     `UPDATE technician_status` occupied；`notify` → 维修人员 + 客户（`order_assigned`）。
 *   - Step 2B 无空闲：`INSERT work_orders`（`pending` + `auto_assigned=1`）；
 *     `notify` → 全体 **ops_admin**（`fault_no_tech`，请手动派单）。
 */

import { pool } from "@/db/mysql";
import { faultRepo } from "@/modules/fault/fault.repository";
import { usersRepo } from "@/modules/users/users.repository";
import {
  technicianStatusRepo,
  workOrdersRepo,
} from "@/modules/workOrders/workOrders.repository";
import { logger } from "@/utils/logger";
import { notify } from "@/services/notify";
import type { MemberLevel } from "@/config/memberPlans";

export interface FaultDispatchContext {
  faultId: number;
  customerUserId: number;
}

function isPaidDispatchLevel(level: MemberLevel): boolean {
  return level === "professional" || level === "enterprise";
}

/** 提示词 ops_admin：本仓库 DB 枚举为 `admin` */
async function listOpsAdminUserIds(): Promise<number[]> {
  return usersRepo.listActiveUserIdsByRole("admin");
}

/** 免费/基础：不建单，仅提醒平台管理员有新故障 */
async function notifyAdminsFaultNew(faultId: number, title: string): Promise<void> {
  const admins = await listOpsAdminUserIds();
  for (const uid of admins) {
    await notify.send({
      userId: uid,
      type: "fault_new",
      title: "新客户故障待处理",
      content: `故障 #${faultId}：${title.slice(0, 120)}（免费/基础版未自动建工单）`,
      metadata: { faultId },
    });
  }
}

export async function runFaultDispatch(ctx: FaultDispatchContext): Promise<void> {
  try {
    const customer = await usersRepo.findById(ctx.customerUserId);
    if (!customer) return;
    const fault = await faultRepo.findById(ctx.faultId);
    if (!fault) return;

    const level = customer.member_level;

    if (!isPaidDispatchLevel(level)) {
      await notifyAdminsFaultNew(fault.id, fault.title);
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const techId = await technicianStatusRepo.pickIdleTechnician(conn);
      if (techId !== null) {
        const orderId = await workOrdersRepo.insert(conn, {
          faultId: ctx.faultId,
          assignedTo: techId,
          status: "assigned",
          autoAssigned: true,
        });
        await technicianStatusRepo.setBusy(conn, techId, true, orderId);
        await conn.commit();

        const tech = await usersRepo.findById(techId);
        const techLabel = tech?.display_name ?? tech?.username ?? "维修人员";
        await notify.send({
          userId: techId,
          type: "order_assigned",
          title: "您有新的维修工单",
          content: `故障「${fault.title.slice(0, 40)}」已自动派给您，工单 #${orderId}`,
          metadata: { orderId, faultId: fault.id },
        });
        await notify.send({
          userId: ctx.customerUserId,
          type: "order_assigned",
          title: "维修人员已指派",
          content: `您的故障报告已指派维修人员：${techLabel}（工单 #${orderId}）`,
          metadata: { orderId, faultId: fault.id, technician: techLabel },
        });
      } else {
        await workOrdersRepo.insert(conn, {
          faultId: ctx.faultId,
          assignedTo: null,
          status: "pending",
          autoAssigned: true,
        });
        await conn.commit();

        const admins = await listOpsAdminUserIds();
        for (const uid of admins) {
          await notify.send({
            userId: uid,
            type: "fault_no_tech",
            title: "请手动派单",
            content: `故障「${fault.title.slice(0, 60)}」暂无空闲维修人员，请到工单处理。`,
            metadata: { faultId: fault.id },
          });
        }
      }
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    logger.error({ err: e, faultId: ctx.faultId }, "自动派单引擎失败");
  }
}
