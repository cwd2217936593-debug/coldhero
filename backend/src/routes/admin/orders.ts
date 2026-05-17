/**
 * 管理员 · 工单管理 API（提示词 Step 7）
 * --------------------------------
 * GET    /api/admin/orders          列表（status / customerId / zoneId / page / size）
 * GET    /api/admin/orders/technicians  维修人员 + 忙碌状态（派单 UI）
 * POST   /api/admin/orders          手动建单；有 assignedTo 时事务内占用并发校验
 * PATCH  /api/admin/orders/:id      改状态/备注/时间；终态时与释放维修工同事务
 * DELETE /api/admin/orders/:id      驳回 → status=rejected（软操作）+ 通知客户
 * POST   /api/admin/orders/:id/assign  派单；维修人员 is_busy=1 时 409 CONFLICT
 */

import { Router } from "express";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";
import {
  technicianStatusRepo,
  workOrdersRepo,
  type WorkOrderStatus,
} from "@/modules/workOrders/workOrders.repository";
import { faultRepo } from "@/modules/fault/fault.repository";
import { usersRepo } from "@/modules/users/users.repository";
import { BadRequestError, ConflictError, NotFoundError } from "@/utils/errors";
import { notify } from "@/services/notify";

const router = Router();

const statusEnum = z.enum([
  "pending",
  "assigned",
  "arrived",
  "in_progress",
  "done",
  "closed",
  "rejected",
]);

const listQ = z.object({
  /** query 兼容 region 写法 customer_id → customerId */
  status: statusEnum.optional(),
  customerId: z.coerce.number().optional(),
  customer_id: z.coerce.number().optional(),
  zoneId: z.coerce.number().optional(),
  zone_id: z.coerce.number().optional(),
  page: z.coerce.number().int().positive().default(1),
  size: z.coerce.number().int().positive().max(100).default(20),
});

function mapOrder(
  r: Awaited<ReturnType<typeof workOrdersRepo.listWithDetails>>["items"][number],
) {
  return {
    id: r.id,
    faultId: r.fault_id,
    assignedTo: r.assigned_to,
    status: r.status,
    autoAssigned: r.auto_assigned === 1,
    arrivalTime: r.arrival_time,
    completeTime: r.complete_time,
    resultNote: r.result_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    faultTitle: r.fault_title,
    faultType: r.fault_type,
    zoneName: r.zone_name,
    customerName: r.customer_name,
    technicianName: r.tech_name,
  };
}

router.get("/technicians", async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id,
            COALESCE(u.display_name, u.username) AS name,
            COALESCE(ts.is_busy, 0) AS is_busy
     FROM users u
     LEFT JOIN technician_status ts ON ts.user_id = u.id
     WHERE u.role = 'operator' AND u.status = 'active'
     ORDER BY u.id ASC`,
  );
  res.json({
    success: true,
    data: (rows as { id: number; name: string; is_busy: number }[]).map((x) => ({
      id: x.id,
      name: x.name,
      isBusy: Number(x.is_busy) === 1,
    })),
  });
});

router.get("/", async (req, res) => {
  const q = listQ.parse(req.query);
  const customerId = q.customerId ?? q.customer_id;
  const zoneId = q.zoneId ?? q.zone_id;
  const { items, total } = await workOrdersRepo.listWithDetails({
    status: q.status,
    customerId,
    zoneId,
    page: q.page,
    size: q.size,
  });
  res.json({
    success: true,
    data: { items: items.map(mapOrder), total, page: q.page, size: q.size },
  });
});

const createBody = z.object({
  faultId: z.number().int().positive(),
  assignedTo: z.number().int().positive().optional(),
  note: z.string().optional(),
});

router.post("/", async (req, res) => {
  const dto = createBody.parse(req.body);
  const fault = await faultRepo.findById(dto.faultId);
  if (!fault) throw new NotFoundError("故障不存在");

  if (!dto.assignedTo) {
    const id = await workOrdersRepo.insert(pool, {
      faultId: dto.faultId,
      assignedTo: null,
      status: "pending",
      autoAssigned: false,
      resultNote: dto.note ?? null,
    });
    return res.status(201).json({ success: true, data: { id } });
  }

  const technicianId = dto.assignedTo;
  await technicianStatusRepo.ensureRow(technicianId);
  const tech = await usersRepo.findById(technicianId);
  if (!tech || tech.role !== "operator") throw new BadRequestError("维修人员无效");

  const conn = await pool.getConnection();
  let newId: number;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT is_busy FROM technician_status WHERE user_id = ? FOR UPDATE",
      [technicianId],
    );
    if (!rows[0] || Number((rows[0] as { is_busy: number }).is_busy) === 1) {
      throw new ConflictError("该维修人员当前正在处理工单");
    }
    newId = await workOrdersRepo.insert(conn, {
      faultId: dto.faultId,
      assignedTo: technicianId,
      status: "assigned",
      autoAssigned: false,
      resultNote: dto.note ?? null,
    });
    await technicianStatusRepo.setBusy(conn, technicianId, true, newId);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const techName = tech.display_name ?? tech.username;
  await notify.send({
    userId: technicianId,
    type: "order_assigned",
    title: "您有新的维修工单",
    content: `管理员已指派故障「${fault.title.slice(0, 40)}」，工单 #${newId}`,
    metadata: { orderId: newId, faultId: fault.id },
  });
  await notify.send({
    userId: fault.userId,
    type: "order_assigned",
    title: "维修人员已指派",
    content: `您的工单已指派：${techName}（#${newId}）`,
    metadata: { orderId: newId, technician: techName },
  });

  return res.status(201).json({ success: true, data: { id: newId } });
});

const patchBody = z.object({
  status: statusEnum.optional(),
  resultNote: z.string().optional(),
  arrivalTime: z.string().optional(),
  completeTime: z.string().optional(),
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const order = await workOrdersRepo.findById(id);
  if (!order) throw new NotFoundError("工单不存在");
  const dto = patchBody.parse(req.body);

  const patchPayload: Parameters<typeof workOrdersRepo.update>[1] = {};
  if (dto.status !== undefined) patchPayload.status = dto.status;
  if (dto.resultNote !== undefined) patchPayload.resultNote = dto.resultNote;
  if (dto.arrivalTime !== undefined) patchPayload.arrivalTime = new Date(dto.arrivalTime);
  if (dto.completeTime !== undefined) patchPayload.completeTime = new Date(dto.completeTime);
  if (dto.status === "rejected") patchPayload.assignedTo = null;

  const terminal =
    dto.status === "done" || dto.status === "closed" || dto.status === "rejected";
  const shouldRelease = Boolean(terminal && order.assigned_to);

  if (shouldRelease && order.assigned_to) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await workOrdersRepo.updateWithExec(conn, id, patchPayload);
      await technicianStatusRepo.releaseForOrderExec(conn, order.assigned_to, id);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } else {
    await workOrdersRepo.update(id, patchPayload);
  }

  if (dto.status === "done") {
    const fault = await faultRepo.findById(order.fault_id);
    if (fault) {
      await notify.send({
        userId: fault.userId,
        type: "order_completed",
        title: "维修工单已完成",
        content: `故障「${fault.title.slice(0, 40)}」工单已标记完成`,
        metadata: { orderId: id, faultId: fault.id },
      });
    }
  }

  const updated = await workOrdersRepo.findById(id);
  res.json({ success: true, data: updated });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const order = await workOrdersRepo.findById(id);
  if (!order) throw new NotFoundError("工单不存在");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (order.assigned_to) {
      await technicianStatusRepo.releaseForOrderExec(conn, order.assigned_to, id);
    }
    await workOrdersRepo.updateWithExec(conn, id, { status: "rejected", assignedTo: null });
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const fault = await faultRepo.findById(order.fault_id);
  if (fault) {
    await notify.send({
      userId: fault.userId,
      type: "order_rejected",
      title: "工单已驳回",
      content: `您的故障「${fault.title.slice(0, 40)}」关联工单已被驳回`,
      metadata: { orderId: id, faultId: fault.id },
    });
  }
  res.json({ success: true, data: null });
});

const assignBody = z.object({ technicianId: z.number().int().positive() });

router.post("/:id/assign", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError("id 无效");
  const order = await workOrdersRepo.findById(id);
  if (!order) throw new NotFoundError("工单不存在");

  if (order.status === "done" || order.status === "closed" || order.status === "rejected") {
    throw new BadRequestError("工单已结束，不可派单");
  }

  const { technicianId } = assignBody.parse(req.body);
  const tech = await usersRepo.findById(technicianId);
  if (!tech || tech.role !== "operator") throw new BadRequestError("维修人员无效");
  await technicianStatusRepo.ensureRow(technicianId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT is_busy FROM technician_status WHERE user_id = ? FOR UPDATE",
      [technicianId],
    );
    if (!rows[0] || Number((rows[0] as { is_busy: number }).is_busy) === 1) {
      throw new ConflictError("该维修人员当前正在处理工单");
    }
    if (order.assigned_to && order.assigned_to !== technicianId) {
      await technicianStatusRepo.releaseForOrderExec(conn, order.assigned_to, id);
    }
    await workOrdersRepo.updateWithExec(conn, id, {
      assignedTo: technicianId,
      status: "assigned",
    });
    await technicianStatusRepo.setBusy(conn, technicianId, true, id);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const fault = await faultRepo.findById(order.fault_id);
  const techName = tech.display_name ?? tech.username;
  if (fault) {
    await notify.send({
      userId: technicianId,
      type: "order_assigned",
      title: "您有新的维修工单",
      content: `工单 #${id}：${fault.title.slice(0, 40)}`,
      metadata: { orderId: id },
    });
    await notify.send({
      userId: fault.userId,
      type: "order_assigned",
      title: "维修人员已指派",
      content: `已指派 ${techName} 处理您的报修`,
      metadata: { orderId: id },
    });
  }

  const updated = await workOrdersRepo.findById(id);
  res.json({ success: true, data: updated });
});

export default router;
