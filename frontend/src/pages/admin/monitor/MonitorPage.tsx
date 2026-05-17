/**
 * 设备监控（提示词 Step 6：数据来自 `/admin/monitor/*`；本页编排为 Step 11）
 * — 顶部四卡 + 筛选；客户表二级展开冷库；约 30s 轮询汇总 + 当前列表 +（若已展开）名下冷库快照
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { adminApi, type AdminCustomerStatus } from "@/api/admin";
import MetricCard from "@/pages/admin/shared/MetricCard";
import StatusBadge from "@/pages/admin/shared/StatusBadge";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<AdminCustomerStatus, string> = {
  online: "在线",
  offline: "离线",
  alert: "告警",
};

export default function MonitorPage() {
  const [overview, setOverview] = useState<{
    totalZones: number;
    onlineCount: number;
    offlineCount: number;
    alertCount: number;
  } | null>(null);
  const [alertLen, setAlertLen] = useState(0);
  const [regions, setRegions] = useState<Array<{ id: number; name: string }>>([]);
  const [regionId, setRegionId] = useState<number | "">("");
  const [status, setStatus] = useState<AdminCustomerStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<
    Awaited<ReturnType<typeof adminApi.monitorCustomers>>["items"]
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [zonesMap, setZonesMap] = useState<
    Record<number, Awaited<ReturnType<typeof adminApi.monitorCustomerZones>>>
  >({});
  const tabVisibleRef = useRef(true);
  const expandedRef = useRef<number | null>(null);
  expandedRef.current = expanded;

  useEffect(() => {
    const sync = () => {
      tabVisibleRef.current = document.visibilityState === "visible";
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const o = await adminApi.monitorOverview();
      setOverview(o);
      const al = await adminApi.alerts();
      setAlertLen(Array.isArray(al) ? al.length : 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadCustomers = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    try {
      const data = await adminApi.monitorCustomers({
        region_id: regionId === "" ? undefined : regionId,
        status: status === "" ? undefined : status,
        keyword: keyword.trim() || undefined,
        page,
        size: PAGE_SIZE,
      });
      setCustomers(data.items);
      setTotal(data.total);
    } catch {
      setCustomers([]);
      setTotal(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [regionId, status, keyword, page]);

  useEffect(() => {
    void loadOverview();
    const t = window.setInterval(async () => {
      if (!tabVisibleRef.current) return;
      await loadOverview();
      await loadCustomers({ silent: true });
      const ex = expandedRef.current;
      if (ex != null) {
        try {
          const zones = await adminApi.monitorCustomerZones(ex);
          setZonesMap((m) => ({ ...m, [ex]: zones }));
        } catch {
          /* 保留上一轮展开数据 */
        }
      }
    }, 30_000);
    return () => window.clearInterval(t);
  }, [loadOverview, loadCustomers]);

  useEffect(() => {
    adminApi
      .regions()
      .then((r) => setRegions(r.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  async function toggleExpand(id: number) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!zonesMap[id]) {
      try {
        const z = await adminApi.monitorCustomerZones(id);
        setZonesMap((m) => ({ ...m, [id]: z }));
      } catch {
        setZonesMap((m) => ({ ...m, [id]: [] }));
      }
    }
  }

  const hasNextPage = page * PAGE_SIZE < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">设备监控</h1>
            {alertLen > 0 ? (
              <span
                className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-medium text-white"
                title="当前全平台告警设备数"
              >
                告警 {alertLen}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            约每 30 秒刷新汇总、告警数与当前表格（标签页后台时暂停）；展开的名下冷库一并更新
          </p>
        </div>
        {alertLen > 0 ? (
          <div className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-800">
            当前告警设备 <b>{alertLen}</b> 台
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="全部设备" value={overview?.totalZones ?? "—"} />
        <MetricCard title="在线" value={overview?.onlineCount ?? "—"} />
        <MetricCard title="离线" value={overview?.offlineCount ?? "—"} />
        <MetricCard title="告警" value={overview?.alertCount ?? "—"} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs text-slate-500">区域</label>
          <select
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={regionId}
            onChange={(e) => {
              setPage(1);
              setRegionId(e.target.value === "" ? "" : Number(e.target.value));
            }}
          >
            <option value="">全部</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">状态</label>
          <select
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus((e.target.value || "") as AdminCustomerStatus | "");
            }}
          >
            <option value="">全部</option>
            <option value="online">在线</option>
            <option value="offline">离线</option>
            <option value="alert">告警</option>
          </select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="block text-xs text-slate-500">关键词</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="客户名 / 用户名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), void loadCustomers())}
          />
        </div>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          onClick={() => {
            setPage(1);
            void loadCustomers();
          }}
        >
          查询
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-2">客户</th>
              <th className="px-4 py-2">冷库数</th>
              <th className="px-4 py-2">区域</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2">告警</th>
              <th className="px-4 py-2">会员到期</th>
              <th className="w-40 px-4 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            )}
            {!loading &&
              customers.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3">{c.zoneCount}</td>
                    <td className="px-4 py-3 text-slate-600">{c.region ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge kind={c.onlineStatus}>{STATUS_LABEL[c.onlineStatus]}</StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {c.alertCount > 0 ? (
                        <span className="font-medium text-rose-600">{c.alertCount}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.memberExpireAt ?? "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-brand-600 hover:underline"
                        onClick={() => void toggleExpand(c.id)}
                      >
                        {expanded === c.id ? "收起冷库" : "查看冷库"}
                      </button>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-xs font-medium text-slate-500">名下冷库</div>
                        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                          {(zonesMap[c.id] ?? []).map((z) => (
                            <li
                              key={z.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                            >
                              <span>
                                {z.name}{" "}
                                {z.isAlerting ? <span className="ml-2 text-rose-600">告警</span> : null}
                                {!z.isOnline ? <span className="ml-2 text-slate-500">离线</span> : null}
                              </span>
                              <Link
                                to={`/admin/monitor/${z.id}`}
                                className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800"
                              >
                                详情
                              </Link>
                            </li>
                          ))}
                          {(zonesMap[c.id]?.length ?? -1) === 0 && (
                            <li className="px-3 py-4 text-center text-slate-400">暂无绑定冷库</li>
                          )}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            {!loading && !customers.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>
            共 {total} 条 · 第 {page} 页
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className={clsx("rounded border px-2 py-1", page <= 1 && "opacity-40")}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              disabled={!hasNextPage}
              className={clsx("rounded border px-2 py-1", !hasNextPage && "opacity-40")}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
