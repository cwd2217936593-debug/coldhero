/**
 * 管理端用户列表：管理员 / 客户 / 维修人员
 * 对齐 `GET|POST|PATCH /api/admin/users*`：筛选、详情、新建向导、覆盖式绑定冷库、等级调整。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { adminApi } from "@/api/admin";
import { errMessage } from "@/api/client";
import type { MemberLevel } from "@/api/types";
import UserFormModal from "@/pages/admin/users/UserFormModal";
import UserCreateWizard from "@/pages/admin/users/UserCreateWizard";
import ZoneBindModal from "@/pages/admin/users/ZoneBindModal";
import EditLevelModal from "@/pages/admin/users/EditLevelModal";
import UserDetailDrawer from "@/pages/admin/users/UserDetailDrawer";
import { MEMBER_LEVEL_CONFIG } from "@/constants/memberLevels";

const TABS = [
  { key: "ops_admin", label: "管理员账号", role: "ops_admin" as const },
  { key: "customer", label: "客户账号", role: "customer" as const },
  { key: "technician", label: "维修人员", role: "technician" as const },
];

const PAGE_SIZE = 20;

const LEVEL_BADGE: Record<string, string> = {
  free: "bg-slate-200 text-slate-800",
  basic: "bg-sky-100 text-sky-900",
  professional: "bg-violet-100 text-violet-900",
  enterprise: "bg-amber-100 text-amber-950",
};

const LEVEL_LABEL: Record<string, string> = {
  free: "免费",
  basic: "基础",
  professional: "专业",
  enterprise: "企业",
};

type Row = Awaited<ReturnType<typeof adminApi.users>>["items"][number];

export default function UsersPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("customer");
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [regionFilter, setRegionFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled" | "all">("active");
  const [memberLevelFilter, setMemberLevelFilter] = useState<MemberLevel | "">("");
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<Row | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const [bindRow, setBindRow] = useState<Row | null>(null);
  const [levelRow, setLevelRow] = useState<Row | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const tabVisibleRef = useRef(true);
  const blockingModalRef = useRef(false);

  const role = TABS.find((t) => t.key === tab)?.role;

  useEffect(() => {
    blockingModalRef.current =
      editModal !== null ||
      wizardOpen ||
      detailUserId !== null ||
      bindRow !== null ||
      levelRow !== null;
  }, [editModal, wizardOpen, detailUserId, bindRow, levelRow]);

  useEffect(() => {
    const sync = () => {
      tabVisibleRef.current = document.visibilityState === "visible";
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const [regionsMap, setRegionsMap] = useState<Record<number, string>>({});
  const [regionOptions, setRegionOptions] = useState<Array<{ id: number; name: string }>>([]);

  const hydrateRegions = useCallback(async () => {
    try {
      const r = await adminApi.regions();
      const m: Record<number, string> = {};
      for (const x of r) m[x.id] = x.name;
      setRegionsMap(m);
      setRegionOptions(r.map((x) => ({ id: x.id, name: x.name })));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setKeyword(keywordInput), 400);
    return () => window.clearTimeout(t);
  }, [keywordInput]);

  useEffect(() => {
    setKeywordInput("");
    setKeyword("");
    setRegionFilter("");
    setStatusFilter("active");
    setMemberLevelFilter("");
    setExpiringSoon(false);
    setLevelRow(null);
    setPage(1);
  }, [tab]);

  useEffect(() => {
    setPage(1);
  }, [keyword, regionFilter, statusFilter, memberLevelFilter, expiringSoon]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) {
        setLoading(true);
        setMsg(null);
      }
      try {
        const data = await adminApi.users({
          role,
          keyword: keyword.trim() || undefined,
          regionId: regionFilter === "" ? undefined : regionFilter,
          status: statusFilter,
          memberLevel: memberLevelFilter === "" ? undefined : memberLevelFilter,
          expiringSoon: tab === "customer" ? expiringSoon : undefined,
          page,
          size: PAGE_SIZE,
        });
        setItems(data.items);
        setTotal(data.total);
        if (!silent) setMsg(null);
      } catch (e) {
        if (!silent) setMsg(errMessage(e));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [role, keyword, regionFilter, statusFilter, memberLevelFilter, expiringSoon, tab, page],
  );

  useEffect(() => {
    void hydrateRegions();
  }, [hydrateRegions]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!tabVisibleRef.current || blockingModalRef.current) return;
      void hydrateRegions();
      void load({ silent: true });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load, hydrateRegions]);

  const defaultRole = role ?? "customer";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function zoneLimitFallback(row: Row): number {
    if (row.zoneLimit != null && Number.isFinite(row.zoneLimit)) return row.zoneLimit;
    const lvl = row.memberLevel as MemberLevel;
    return MEMBER_LEVEL_CONFIG[lvl]?.zoneLimit ?? 1;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">用户管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            平台管理员可创建<strong className="text-slate-700">管理员 / 客户 / 维修人员</strong>
            账号。请点击右上角「<strong className="text-slate-700">新建用户</strong>」打开向导。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => void load()}
          >
            刷新
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={() => setWizardOpen(true)}
          >
            新建用户
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <div className="text-xs text-slate-500">关键词（用户名 / 手机）</div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="输入后自动搜索"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
          />
        </div>
        <div>
          <div className="text-xs text-slate-500">区域</div>
          <select
            className="mt-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={regionFilter === "" ? "" : String(regionFilter)}
            onChange={(e) => setRegionFilter(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">全部</option>
            {regionOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-500">状态</div>
          <select
            className="mt-1 min-w-[120px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="active">正常</option>
            <option value="disabled">禁用</option>
            <option value="all">全部</option>
          </select>
        </div>
        {tab === "customer" ? (
          <>
            <div>
              <div className="text-xs text-slate-500">会员等级</div>
              <select
                className="mt-1 min-w-[120px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={memberLevelFilter === "" ? "" : memberLevelFilter}
                onChange={(e) => setMemberLevelFilter((e.target.value || "") as MemberLevel | "")}
              >
                <option value="">全部</option>
                <option value="free">免费</option>
                <option value="basic">基础</option>
                <option value="professional">专业</option>
                <option value="enterprise">企业</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-1 text-sm text-slate-700">
              <input type="checkbox" checked={expiringSoon} onChange={(e) => setExpiringSoon(e.target.checked)} />
              即将到期
            </label>
          </>
        ) : null}
      </div>
      {msg ? <div className="text-sm text-amber-700">{msg}</div> : null}

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={clsx(
              "border-b-2 px-3 py-2 text-sm",
              tab === t.key
                ? "border-slate-900 font-medium text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-slate-500">加载中…</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-2">用户名</th>
              <th className="px-4 py-2">手机</th>
              {tab === "customer" ? <th className="px-4 py-2">会员</th> : null}
              <th className="px-4 py-2">区域</th>
              {tab === "customer" ? <th className="px-4 py-2">绑定冷库</th> : null}
              <th className="px-4 py-2">状态</th>
              {tab === "customer" ? <th className="px-4 py-2">到期</th> : null}
              <th className="px-4 py-2 w-64">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={tab === "customer" ? 8 : 5} className="px-4 py-8 text-center text-slate-500">
                  暂无数据
                </td>
              </tr>
            ) : null}
            {items.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-900">{u.username}</div>
                  {u.displayName && u.displayName !== u.username ? (
                    <div className="mt-0.5 text-xs text-slate-500">{u.displayName}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-slate-600">{u.phone ?? "—"}</td>
                {tab === "customer" ? (
                  <td className="px-4 py-2">
                    <span
                      className={clsx(
                        "rounded px-2 py-0.5 text-xs font-medium",
                        LEVEL_BADGE[u.memberLevel] ?? "bg-slate-100",
                      )}
                    >
                      {u.memberLevelLabel ?? LEVEL_LABEL[u.memberLevel] ?? u.memberLevel}
                    </span>
                  </td>
                ) : null}
                <td className="px-4 py-2 text-slate-600">
                  {u.regionId != null ? regionsMap[u.regionId] ?? `ID ${u.regionId}` : "—"}
                </td>
                {tab === "customer" ? (
                  <td className="px-4 py-2 text-slate-600">{u.bindZoneCount}</td>
                ) : null}
                <td className="px-4 py-2">{u.status === "active" ? "正常" : "禁用"}</td>
                {tab === "customer" ? (
                  <td className="px-4 py-2 text-slate-600">{u.memberExpireAt ?? "—"}</td>
                ) : null}
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="text-xs text-brand-600 hover:underline"
                      onClick={() => setDetailUserId(u.id)}
                    >
                      详情
                    </button>
                    <button
                      type="button"
                      className="text-xs text-brand-600 hover:underline"
                      onClick={() => setEditModal(u)}
                    >
                      编辑
                    </button>
                    {tab === "customer" ? (
                      <>
                        <button
                          type="button"
                          className="text-xs text-brand-600 hover:underline"
                          onClick={() => setLevelRow(u)}
                        >
                          调整等级
                        </button>
                        <button
                          type="button"
                          className="text-xs text-brand-600 hover:underline"
                          onClick={() => setBindRow(u)}
                        >
                          绑定冷库
                        </button>
                      </>
                    ) : null}
                    {u.status === "active" ? (
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        onClick={async () => {
                          if (!confirm("禁用该账号？")) return;
                          try {
                            const { warning } = await adminApi.deleteUser(u.id);
                            if (warning) setMsg(warning);
                            await load();
                          } catch (e) {
                            setMsg(errMessage(e));
                          }
                        }}
                      >
                        禁用
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-emerald-700 hover:underline"
                        onClick={async () => {
                          try {
                            const { warning } = await adminApi.patchUser(u.id, { status: "active" });
                            if (warning) setMsg(warning);
                            await load();
                          } catch (e) {
                            setMsg(errMessage(e));
                          }
                        }}
                      >
                        启用
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            共 {total} 条，第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}

      {editModal ? (
        <UserFormModal
          open
          defaultRole={defaultRole}
          editId={editModal.id}
          initial={{
            username: editModal.username,
            displayName: editModal.displayName ?? null,
            phone: editModal.phone,
            role: editModal.role,
            regionId: editModal.regionId,
            memberExpireAt: editModal.memberExpireAt,
          }}
          onClose={() => setEditModal(null)}
          onSaved={() => {
            void hydrateRegions();
            void load({ silent: true });
          }}
        />
      ) : null}

      {wizardOpen ? (
        <UserCreateWizard
          open
          defaultRole={defaultRole}
          onClose={() => setWizardOpen(false)}
          onCreated={() => void load({ silent: true })}
        />
      ) : null}

      <UserDetailDrawer open={detailUserId !== null} userId={detailUserId} onClose={() => setDetailUserId(null)} />

      {bindRow ? (
        <ZoneBindModal
          userId={bindRow.id}
          username={bindRow.username}
          onClose={() => setBindRow(null)}
          onSaved={() => void load({ silent: true })}
        />
      ) : null}

      {levelRow && tab === "customer" ? (
        <EditLevelModal
          open
          userId={levelRow.id}
          username={levelRow.username}
          currentLevel={levelRow.memberLevel as MemberLevel}
          zoneLimit={zoneLimitFallback(levelRow)}
          boundZoneCount={levelRow.bindZoneCount}
          onClose={() => setLevelRow(null)}
          onSaved={(warning) => {
            if (warning) setMsg(warning);
            void load({ silent: true });
          }}
        />
      ) : null}
    </div>
  );
}
