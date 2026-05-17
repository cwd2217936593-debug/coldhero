/**
 * 管理端用户管理 — 业务编排层（Step 4）
 * --------------------------------
 * 路由层只做 HTTP / Zod；唯一性、工单告警、Redis 配额与黑名单等在此收敛。
 */

import { pool } from "@/db/mysql";
import { redis } from "@/db/redis";
import { env } from "@/config/env";
import { MEMBER_LEVEL_CONFIG, getMemberLevelLabel } from "@/constants/memberLevels";
import type { MemberLevel } from "@/config/memberPlans";
import { getPlan } from "@/config/memberPlans";
import { quotaService } from "@/modules/quota/quota.service";
import { refreshTokensRepo } from "@/modules/auth/refreshTokens.repository";
import { regionsRepo } from "@/modules/regions/regions.repository";
import { technicianStatusRepo } from "@/modules/workOrders/workOrders.repository";
import { workOrdersRepo } from "@/modules/workOrders/workOrders.repository";
import {
  usersRepo,
  type AdminUserListRow,
  type UserRole,
  type UserRow,
  type UserStatus,
} from "@/modules/users/users.repository";
import { userLevelLogsRepo } from "@/modules/users/userLevelLogs.repository";
import { userZoneBindingsRepo } from "@/modules/users/userZoneBindings.repository";
import { zonesRepo, type ZoneRow } from "@/modules/zones/zones.repository";
import { notify } from "@/services/notify";
import { hashPassword } from "@/utils/hash";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "@/utils/errors";
import { getUtc8DateString } from "@/utils/time";
import type { CreateUserBody, UpdateLevelBody } from "@/validators/userValidator";

const BLACKLIST_TTL_SEC = 604800; // 7 天，与文档「对齐 refresh」占位一致

export type ExternalAccountRole = "customer" | "technician" | "ops_admin";
export type ExternalRoleFilter = ExternalAccountRole | "all";

export interface AdminUserListQuery {
  role?: ExternalRoleFilter;
  memberLevel?: MemberLevel;
  regionId?: number;
  status?: UserStatus | "all";
  keyword?: string;
  expiringSoon?: boolean;
  page: number;
  size: number;
}

export interface AdminUserListItem {
  id: number;
  username: string;
  realName: string;
  phone: string | null;
  role: ExternalAccountRole;
  memberLevel: MemberLevel;
  memberLevelLabel: string;
  regionId: number | null;
  regionName: string;
  status: UserStatus;
  memberExpireAt: string | null;
  boundZoneCount: number;
  zoneLimit: number;
  lastLoginAt: string | null;
  createdAt: string;
  createdByName: string;
}

export interface AdminUpdateUserPatch {
  regionId?: number | null;
  /** YYYY-MM-DD；null 清空到期日 */
  memberExpireAt?: string | null;
  phone?: string | null;
  realName?: string | null;
  notes?: string | null;
  email?: string | null;
  status?: UserStatus;
}

function isImmutableAdmin(row: UserRow): boolean {
  return row.role === "admin" && env.immutableAdminUsernames.includes(row.username);
}

function toDbRole(r: ExternalAccountRole): UserRole {
  if (r === "customer") return "viewer";
  if (r === "technician") return "operator";
  return "admin";
}

function toExternalRole(r: UserRole): ExternalAccountRole {
  if (r === "viewer") return "customer";
  if (r === "operator") return "technician";
  return "ops_admin";
}

function ymd(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

async function ensureRegionExists(regionId: number | null | undefined): Promise<void> {
  if (regionId === null || regionId === undefined) return;
  const r = await regionsRepo.findById(regionId);
  if (!r) throw new BadRequestError("区域不存在");
}

async function ensureEmailFree(email: string, excludeUserId?: number): Promise<void> {
  const hit = await usersRepo.findByEmail(email);
  if (hit && hit.id !== excludeUserId) throw new BadRequestError("邮箱已被使用");
}

async function ensurePhoneFree(phone: string, excludeUserId?: number): Promise<void> {
  const hit = await usersRepo.findByPhone(phone);
  if (hit && hit.id !== excludeUserId) throw new BadRequestError("手机号已被使用");
}

export const userService = {
  async createUser(dto: CreateUserBody, actorUserId: number): Promise<{
    userId: number;
    username: string;
    role: ExternalAccountRole;
    memberLevel: MemberLevel;
    boundZones: number;
    tempPassword: string;
  }> {
    if (await usersRepo.findByUsername(dto.username)) {
      throw new BadRequestError("用户名已存在");
    }
    await ensurePhoneFree(dto.phone);

    const dbRole = toDbRole(dto.role);
    const email = dto.email?.trim() ? dto.email.trim() : `${dto.username}@internal.coldhero.local`;
    await ensureEmailFree(email);

    const memberLevel: MemberLevel =
      dto.role === "customer" ? dto.memberLevel ?? "free" : "free";

    const zoneLimit =
      dto.role === "customer"
        ? dto.zoneLimit ?? MEMBER_LEVEL_CONFIG[memberLevel].zoneLimit
        : -1;

    const zoneIds = dto.zoneIds ?? [];
    const uniqZones = [...new Set(zoneIds)];

    if (dto.role === "customer") {
      if (zoneLimit >= 0 && uniqZones.length > zoneLimit) {
        throw new BadRequestError(
          `绑定冷库数量不能超过上限 ${zoneLimit}（当前选择了 ${uniqZones.length} 台）`,
        );
      }
      if (uniqZones.length) {
        const found = await zonesRepo.findByIds(uniqZones);
        if (found.length !== uniqZones.length) {
          throw new BadRequestError("存在无效的冷库 ID");
        }
        const conflicts = await userZoneBindingsRepo.findConflictsForZones(uniqZones, 0);
        if (conflicts.length) {
          throw new ConflictError("部分冷库已被其他用户绑定", {
            conflicts: conflicts.map((c) => ({
              zoneId: c.zoneId,
              holderUsername: c.holderUsername,
            })),
          });
        }
      }
    } else if (uniqZones.length) {
      throw new BadRequestError("仅客户账号可在创建时绑定冷库");
    }

    await ensureRegionExists(dto.regionId ?? undefined);

    const passwordPlain = dto.password;
    const hash = await hashPassword(passwordPlain);
    const expireDate = dto.memberExpireAt ? new Date(`${dto.memberExpireAt}T00:00:00.000Z`) : null;

    const conn = await pool.getConnection();
    let userId = 0;
    try {
      await conn.beginTransaction();
      userId = await usersRepo.createFull(
        {
          username: dto.username,
          email,
          passwordHash: hash,
          phone: dto.phone,
          displayName: dto.realName,
          memberLevel,
          role: dbRole,
          regionId: dto.regionId ?? null,
          memberExpireAt: expireDate,
          zoneLimit,
          notes: dto.notes ?? null,
          createdBy: actorUserId,
        },
        conn,
      );

      if (dto.role === "customer") {
        for (const zid of uniqZones) {
          await userZoneBindingsRepo.bindZone(conn, userId, zid, actorUserId);
        }
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    if (dbRole === "operator") await technicianStatusRepo.ensureRow(userId);

    await notify.send({
      userId,
      type: "welcome",
      title: "账号已开通",
      content: "欢迎加入冷库智能监管平台，请登录后尽快修改密码。",
      metadata: { username: dto.username },
    });

    return {
      userId,
      username: dto.username,
      role: dto.role,
      memberLevel,
      boundZones: uniqZones.length,
      tempPassword: passwordPlain,
    };
  },

  async getUserList(q: AdminUserListQuery): Promise<{
    items: AdminUserListItem[];
    total: number;
    page: number;
    size: number;
  }> {
    const dbRole =
      q.role && q.role !== "all" ? toDbRole(q.role as ExternalAccountRole) : undefined;
    const statusFilter: UserStatus | "all" = q.status ?? "active";

    const { items, total } = await usersRepo.listAdminDetailed({
      role: dbRole,
      memberLevel: q.memberLevel,
      regionId: q.regionId,
      status: statusFilter,
      keyword: q.keyword,
      expiringSoon: q.expiringSoon,
      page: q.page,
      size: q.size,
    });

    const mapped = items.map((row: AdminUserListRow) => ({
      id: row.id,
      username: row.username,
      realName: row.display_name ?? "",
      phone: row.phone,
      role: toExternalRole(row.role),
      memberLevel: row.member_level,
      memberLevelLabel: getMemberLevelLabel(row.member_level),
      regionId: row.region_id,
      regionName: row.region_name ?? "",
      status: row.status,
      memberExpireAt: ymd(row.member_expire_at),
      boundZoneCount: Number(row.bound_zone_count) || 0,
      zoneLimit: row.zone_limit,
      lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      createdByName: row.creator_name ?? "",
    }));

    return { items: mapped, total, page: q.page, size: q.size };
  },

  async getUserDetail(id: number): Promise<{
    user: UserRow;
    regionName: string | null;
    creatorName: string | null;
    boundZones: Array<{ id: number; code: string; name: string; isOnline: boolean }>;
    levelLogs: Awaited<ReturnType<typeof userLevelLogsRepo.listByUserId>>;
    quotas: { aiChat: Awaited<ReturnType<typeof quotaService.peek>>; report: Awaited<ReturnType<typeof quotaService.peek>> };
  }> {
    const row = await usersRepo.findById(id);
    if (!row) throw new NotFoundError("用户不存在");

    const region = row.region_id ? await regionsRepo.findById(row.region_id) : null;
    const creator = row.created_by ? await usersRepo.findById(row.created_by) : null;

    const zids = await zonesRepo.findZoneIdsBoundToCustomer(id);
    const zones = zids.length ? await zonesRepo.findByIds(zids) : [];
    const boundZones = zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      isOnline: z.is_online === 1,
    }));

    const plan = getPlan(row.member_level);
    const [aiChat, report] = await Promise.all([
      quotaService.peek(row.id, plan, "aiChat"),
      quotaService.peek(row.id, plan, "report"),
    ]);

    const levelLogs = await userLevelLogsRepo.listByUserId(id);

    return {
      user: row,
      regionName: region?.name ?? null,
      creatorName: creator ? creator.display_name ?? creator.username : null,
      boundZones,
      levelLogs,
      quotas: { aiChat, report },
    };
  },

  async updateUser(id: number, patch: AdminUpdateUserPatch): Promise<UserRow> {
    const row = await usersRepo.findById(id);
    if (!row) throw new NotFoundError("用户不存在");

    if (patch.status === "disabled" && row.status === "active") {
      await this.disableUser(id);
      const next = await usersRepo.findById(id);
      if (!next) throw new NotFoundError("用户不存在");
      return next;
    }

    if (patch.status === "active" && row.status === "disabled") {
      if (isImmutableAdmin(row)) throw new ForbiddenError("该管理员账号不可修改启用状态");
      await redis.del(`blacklist:${id}`);
      await usersRepo.updateAdminProfile(id, { status: "active" });
      const next = await usersRepo.findById(id);
      if (!next) throw new NotFoundError("用户不存在");
      return next;
    }

    if (patch.regionId !== undefined) await ensureRegionExists(patch.regionId);

    if (patch.email !== undefined && patch.email !== null && patch.email.trim()) {
      await ensureEmailFree(patch.email.trim(), id);
    }
    if (patch.phone !== undefined && patch.phone !== null && String(patch.phone).trim()) {
      await ensurePhoneFree(String(patch.phone).trim(), id);
    }

    const expire =
      patch.memberExpireAt === undefined
        ? undefined
        : patch.memberExpireAt === null || String(patch.memberExpireAt).trim() === ""
          ? null
          : new Date(`${String(patch.memberExpireAt).trim().slice(0, 10)}T00:00:00.000Z`);

    await usersRepo.updateAdminProfile(id, {
      regionId: patch.regionId,
      memberExpireAt: expire,
      phone: patch.phone,
      displayName: patch.realName,
      notes: patch.notes,
      email:
        patch.email === undefined || patch.email === null
          ? undefined
          : patch.email.trim() === ""
            ? undefined
            : patch.email.trim(),
    });

    const next = await usersRepo.findById(id);
    if (!next) throw new NotFoundError("用户不存在");
    return next;
  },

  async disableUser(userId: number): Promise<{ warning?: string }> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    if (isImmutableAdmin(row)) throw new ForbiddenError("禁止禁用受保护的管理员账号");

    await usersRepo.updateAdminProfile(userId, { status: "disabled" });
    await refreshTokensRepo.revokeAllForUser(userId);
    await redis.set(`blacklist:${userId}`, "1", "EX", BLACKLIST_TTL_SEC);

    let warning: string | undefined;
    const wo = await workOrdersRepo.countActiveTouchingUser(userId);
    if (wo > 0) {
      warning = `该用户关联 ${wo} 条进行中的工单，请管理员酌情处理。`;
    }

    const label = row.display_name ?? row.username;
    const admins = await usersRepo.listActiveUserIdsByRole("admin");
    for (const aid of admins) {
      await notify.send({
        userId: aid,
        type: "admin_user_disabled_alert",
        title: "账号已禁用",
        content: `用户 ${label} 账号已被禁用，如有关联工单请及时处理`,
        metadata: { disabledUserId: userId },
      });
    }

    return warning ? { warning } : {};
  },

  async updateUserLevel(
    userId: number,
    dto: UpdateLevelBody,
    actorUserId: number,
  ): Promise<{
    data: { userId: number; fromLevel: MemberLevel; toLevel: MemberLevel; zoneLimit: number };
    warning?: string;
  }> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    if (row.role !== "viewer") throw new BadRequestError("仅客户账号可调整会员等级");
    if (isImmutableAdmin(row)) throw new ForbiddenError("禁止修改该账号等级");

    const fromLevel = row.member_level;
    const toLevel = dto.memberLevel;
    const zoneLimit =
      dto.zoneLimit ?? MEMBER_LEVEL_CONFIG[toLevel].zoneLimit;

    await userLevelLogsRepo.insert({
      userId,
      fromLevel,
      toLevel,
      changedBy: actorUserId,
      reason: dto.reason ?? null,
    });

    await usersRepo.updateAdminProfile(userId, {
      memberLevel: toLevel,
      zoneLimit,
    });

    const date = getUtc8DateString(new Date());
    await redis.del(`quota:${userId}:${date}:ai_chat`, `quota:${userId}:${date}:report`);

    await notify.send({
      userId,
      type: "service_updated",
      title: "服务更新通知",
      content: "您的服务已更新，如有疑问请联系客服。",
      metadata: {},
    });

    let warning: string | undefined;
    if (zoneLimit >= 0) {
      const bound = (await zonesRepo.findZoneIdsBoundToCustomer(userId)).length;
      if (bound > zoneLimit) {
        warning = `当前已绑定 ${bound} 台冷库，超过新等级上限 ${zoneLimit} 台，请手动解绑多余冷库`;
      }
    }

    return {
      data: { userId, fromLevel, toLevel, zoneLimit },
      ...(warning ? { warning } : {}),
    };
  },

  async bindZones(userId: number, zoneIds: number[], actorUserId: number): Promise<void> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    if (row.role !== "viewer") throw new BadRequestError("仅客户账号可绑定冷库");

    const uniq = [...new Set(zoneIds)];
    if (!uniq.length) return;

    const found = await zonesRepo.findByIds(uniq);
    if (found.length !== uniq.length) throw new BadRequestError("存在无效的冷库 ID");

    const held = new Set(await zonesRepo.findZoneIdsBoundToCustomer(userId));
    const newOnes = uniq.filter((z) => !held.has(z));
    if (!newOnes.length) return;

    const limit = row.zone_limit;
    const currentCount = held.size;
    if (limit >= 0 && currentCount + newOnes.length > limit) {
      const remain = Math.max(0, limit - currentCount);
      throw new UnprocessableEntityError(
        `该用户最多可绑定 ${limit} 台冷库，当前已绑定 ${currentCount} 台，还可新增 ${remain} 台`,
        "ZONE_LIMIT_EXCEEDED",
        { zoneLimit: limit, current: currentCount, remain },
      );
    }

    const conflicts = await userZoneBindingsRepo.findConflictsForZones(newOnes, userId);
    if (conflicts.length) {
      throw new ConflictError("部分冷库已被其他用户绑定", {
        conflicts: conflicts.map((c) => ({
          zoneId: c.zoneId,
          holderUsername: c.holderUsername,
        })),
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const zid of newOnes) {
        await userZoneBindingsRepo.bindZone(conn, userId, zid, actorUserId);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  /** 覆盖式同步绑定（先清空该客户全部绑定再写入；兼容旧 bind-zones 覆盖语义） */
  async syncCustomerZones(userId: number, zoneIds: number[], actorUserId: number): Promise<void> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    if (row.role !== "viewer") throw new BadRequestError("仅客户账号可绑定冷库");

    const uniq = [...new Set(zoneIds)];
    const limit = row.zone_limit;
    if (limit >= 0 && uniq.length > limit) {
      throw new UnprocessableEntityError(
        `该用户最多可绑定 ${limit} 台冷库，当前提交了 ${uniq.length} 台`,
        "ZONE_LIMIT_EXCEEDED",
        { zoneLimit: limit, requested: uniq.length },
      );
    }

    if (uniq.length) {
      const found = await zonesRepo.findByIds(uniq);
      if (found.length !== uniq.length) throw new BadRequestError("存在无效的冷库 ID");
      const conflicts = await userZoneBindingsRepo.findConflictsForZones(uniq, userId);
      if (conflicts.length) {
        throw new ConflictError("部分冷库已被其他用户绑定", {
          conflicts: conflicts.map((c) => ({
            zoneId: c.zoneId,
            holderUsername: c.holderUsername,
          })),
        });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE user_zone_bindings SET unbound_at = CURRENT_TIMESTAMP WHERE user_id = ? AND unbound_at IS NULL`,
        [userId],
      );
      await conn.execute(`UPDATE zones SET customer_id = NULL WHERE customer_id = ?`, [userId]);
      for (const zid of uniq) {
        await userZoneBindingsRepo.bindZone(conn, userId, zid, actorUserId);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  async listAvailableZones(customerUserId: number, keyword?: string): Promise<ZoneRow[]> {
    const row = await usersRepo.findById(customerUserId);
    if (!row) throw new NotFoundError("用户不存在");
    if (row.role !== "viewer") throw new BadRequestError("仅客户账号可查询可绑定冷库");
    return zonesRepo.listAvailableForBinding(customerUserId, keyword);
  },

  async unbindZone(userId: number, zoneId: number): Promise<void> {
    const row = await usersRepo.findById(userId);
    if (!row) throw new NotFoundError("用户不存在");
    if (row.role !== "viewer") throw new BadRequestError("仅客户账号可解绑冷库");
    await userZoneBindingsRepo.unbindZone(userId, zoneId);
  },
};
