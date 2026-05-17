/**
 * 新建账号向导：对齐 `CreateUserSchema`（手机号、密码强度、实名等）。
 */

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { MemberLevel, Zone } from "@/api/types";
import { adminApi } from "@/api/admin";
import { listZones } from "@/api/sensors";
import { errMessage } from "@/api/client";
import { MEMBER_LEVEL_CONFIG, MEMBER_LEVEL_ORDER, formatQuota } from "@/constants/memberLevels";

type ExtRole = "customer" | "technician" | "ops_admin";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const PHONE_RE = /^1[3-9]\d{9}$/;
const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const REALNAME_MAX = 32;

function randomPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]!;
  let s = pick(upper) + pick(lower) + pick(digits);
  const pool = upper + lower + digits;
  while (s.length < 12) s += pick(pool);
  return s
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

export default function UserCreateWizard({
  open,
  defaultRole,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultRole: ExtRole;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [realName, setRealName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [role, setRole] = useState<ExtRole>(defaultRole);
  const [memberLevel, setMemberLevel] = useState<MemberLevel>("free");
  const [zoneLimit, setZoneLimit] = useState(String(MEMBER_LEVEL_CONFIG.free.zoneLimit));
  const [regionId, setRegionId] = useState<number | "">("");
  const [memberExpireAt, setMemberExpireAt] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [pickedZones, setPickedZones] = useState<Set<number>>(new Set());
  const [zoneQuery, setZoneQuery] = useState("");
  const [regions, setRegions] = useState<Array<{ id: number; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdPw, setCreatedPw] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    adminApi
      .regions()
      .then((r) => setRegions(r.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setUsername("");
    setPassword(randomPassword());
    setPhone("");
    setRealName("");
    setEmail("");
    setNotes("");
    setRole(defaultRole);
    setMemberLevel("free");
    setZoneLimit(String(MEMBER_LEVEL_CONFIG.free.zoneLimit));
    setRegionId("");
    setMemberExpireAt("");
    setPickedZones(new Set());
    setZoneQuery("");
    setErr(null);
    setCreatedPw(null);
    let live = true;
    listZones()
      .then((z) => live && setZones(z))
      .catch(() => live && setZones([]));
    return () => {
      live = false;
    };
  }, [open, defaultRole]);

  useEffect(() => {
    if (!open) return;
    setZoneLimit(String(MEMBER_LEVEL_CONFIG[memberLevel].zoneLimit));
  }, [memberLevel, open]);

  const filteredZones = useMemo(() => {
    const q = zoneQuery.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => z.name.toLowerCase().includes(q) || z.code.toLowerCase().includes(q));
  }, [zones, zoneQuery]);

  const parsedZoneLimit = Number(zoneLimit.trim());
  const zoneLimitOk =
    role !== "customer" ||
    (zoneLimit.trim() !== "" && Number.isFinite(parsedZoneLimit) && Number.isInteger(parsedZoneLimit) && parsedZoneLimit >= -1);

function step0FieldErrors(): string[] {
  const errs: string[] = [];
  const u = username.trim();
  if (!USERNAME_RE.test(u)) errs.push("用户名须为 3–32 位，仅字母、数字、下划线");
  if (!PWD_RE.test(password)) errs.push("密码至少 8 位，且须同时包含大写、小写与数字");
  const p = phone.trim();
  if (!PHONE_RE.test(p)) errs.push("手机号须为大陆合法号段（11 位且第二位为 3–9，如 13812345678）");
  const rn = realName.trim();
  if (rn.length < 1 || rn.length > REALNAME_MAX) errs.push(`实名须为 1–${REALNAME_MAX} 个字`);
  const em = email.trim();
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) errs.push("邮箱格式不正确；不需要请留空");
  return errs;
}

  const step0Ok = step0FieldErrors().length === 0;

  const step1Ok = role !== "customer" || zoneLimitOk;

  const step2Ok =
    role !== "customer" ||
    pickedZones.size <= (parsedZoneLimit >= 0 ? parsedZoneLimit : Number.MAX_SAFE_INTEGER);

  function next() {
    setErr(null);
    if (step === 0 && !step0Ok) {
      const parts = step0FieldErrors();
      setErr(parts.length ? parts.join("；") + "。" : "");
      return;
    }
    if (step === 1 && !step1Ok) {
      setErr("请填写有效的冷库上限（整数 ≥ -1）。");
      return;
    }
    if (step === 2 && !step2Ok) {
      setErr("所选冷库数量超过当前上限，请减少勾选或提高上限。");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const zoneIds = role === "customer" ? [...pickedZones] : [];
      const lim =
        role === "customer" ? (zoneLimit.trim() === "" ? undefined : parsedZoneLimit) : undefined;
      const body = {
        username: username.trim(),
        password,
        phone: phone.trim(),
        realName: realName.trim(),
        role,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(role === "customer"
          ? {
              memberLevel,
              ...(lim !== undefined ? { zoneLimit: lim } : {}),
              ...(zoneIds.length ? { zoneIds } : {}),
              ...(memberExpireAt.trim() ? { memberExpireAt: memberExpireAt.trim().slice(0, 10) } : {}),
            }
          : {}),
        ...(regionId === "" ? {} : { regionId }),
      };
      const out = await adminApi.createUser(body);
      setCreatedPw(out.tempPassword);
      await onCreated();
      setStep(3);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="wizard-title" className="text-sm font-semibold text-slate-900">
          新建用户（管理员 · 客户 · 维修）
        </div>
        <div className="mt-2 flex gap-1 text-[11px] text-slate-500">
          {["账号与安全", "角色与套餐", "冷库（可选）", "完成"].map((t, i) => (
            <span
              key={t}
              className={clsx(
                "rounded px-2 py-0.5",
                step === i ? "bg-slate-900 text-white" : i < step ? "bg-emerald-50 text-emerald-800" : "bg-slate-100",
              )}
            >
              {i + 1}. {t}
            </span>
          ))}
        </div>
        {err ? <div className="mt-2 text-sm text-rose-600">{err}</div> : null}

        {step === 0 ? (
          <div className="mt-4 space-y-3 text-sm">
            <Field label="用户名（3–32，字母数字下划线）">
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="登录密码">
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50"
                  onClick={() => setPassword(randomPassword())}
                >
                  随机生成
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">至少 8 位，且同时包含大写、小写与数字。</p>
            </Field>
            <Field label="手机号（大陆 11 位）">
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="例：13812345678"
              />
              <p className="mt-1 text-[11px] text-slate-400">第二位须为 3–9（与后端校验一致）。</p>
            </Field>
            <Field label="实名 / 显示名">
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={realName}
                onChange={(e) => setRealName(e.target.value.slice(0, REALNAME_MAX))}
              />
            </Field>
            <Field label="邮箱（可选）">
              <input
                type="text"
                inputMode="email"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="不需要请留空"
              />
              <p className="mt-1 text-[11px] text-slate-400">填写则须为完整邮箱；任意占位字符会导致无法进入下一步。</p>
            </Field>
            <Field label="内部备注（可选）">
              <textarea
                className="mt-1 min-h-[64px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-4 space-y-3 text-sm">
            <Field label="角色">
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={role}
                onChange={(e) => setRole(e.target.value as ExtRole)}
              >
                <option value="customer">客户</option>
                <option value="technician">维修人员</option>
                <option value="ops_admin">管理员</option>
              </select>
            </Field>
            <Field label="所属区域">
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">—</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            {role === "customer" ? (
              <>
                <Field label="会员等级">
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={memberLevel}
                    onChange={(e) => setMemberLevel(e.target.value as MemberLevel)}
                  >
                    {MEMBER_LEVEL_ORDER.map((l) => (
                      <option key={l} value={l}>
                        {MEMBER_LEVEL_CONFIG[l].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="font-medium text-slate-800">当前档位配额（对比）</div>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    <li>AI 对话/日：{formatQuota(MEMBER_LEVEL_CONFIG[memberLevel].aiChatDaily)}</li>
                    <li>报告/日：{formatQuota(MEMBER_LEVEL_CONFIG[memberLevel].reportDaily)}</li>
                    <li>历史天数：{formatQuota(MEMBER_LEVEL_CONFIG[memberLevel].historyDays)}</li>
                    <li>
                      冷库上限：{MEMBER_LEVEL_CONFIG[memberLevel].zoneLimit < 0 ? "不限" : MEMBER_LEVEL_CONFIG[memberLevel].zoneLimit}
                    </li>
                  </ul>
                </div>
                <Field label="冷库绑定上限（整数，-1 不限）">
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                    value={zoneLimit}
                    onChange={(e) => setZoneLimit(e.target.value)}
                  />
                </Field>
                <Field label="会员到期（可选）">
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={memberExpireAt}
                    onChange={(e) => setMemberExpireAt(e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <p className="text-xs text-slate-500">非客户账号固定为免费配额档位，创建后可在详情中查看。</p>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 space-y-3 text-sm">
            {role !== "customer" ? (
              <p className="text-xs text-slate-500">仅客户可在开户时预选冷库，请点击下一步提交。</p>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  选择与上限匹配的库区（已选 {pickedZones.size}
                  {parsedZoneLimit >= 0 ? ` / 上限 ${parsedZoneLimit}` : " / 不限"}）。占用冲突将在提交时提示。
                </p>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="筛选库区"
                  value={zoneQuery}
                  onChange={(e) => setZoneQuery(e.target.value)}
                />
                <ul className="max-h-52 space-y-2 overflow-y-auto rounded border border-slate-100 p-2">
                  {filteredZones.map((z) => (
                    <li key={z.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={pickedZones.has(z.id)}
                        onChange={(e) => {
                          const n = new Set(pickedZones);
                          if (e.target.checked) n.add(z.id);
                          else n.delete(z.id);
                          setPickedZones(n);
                        }}
                      />
                      <span className="text-slate-800">{z.name}</span>
                      <span className="text-slate-500">({z.code})</span>
                    </li>
                  ))}
                  {filteredZones.length === 0 ? (
                    <li className="py-6 text-center text-slate-400">暂无可选库区</li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-emerald-800">账号已创建。</p>
            <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm text-white">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">初始密码（请复制给用户）</div>
              <div className="mt-1 break-all">{createdPw ?? "—"}</div>
            </div>
            <p className="text-xs text-slate-500">关闭向导前请确认已将密码安全送达对方。</p>
          </div>
        ) : null}

        <div className="mt-6 flex justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => {
              if (step === 3) onClose();
              else if (step > 0) setStep((s) => Math.max(0, s - 1));
              else onClose();
            }}
          >
            {step === 3 ? "关闭" : step > 0 ? "上一步" : "取消"}
          </button>
          <div className="flex gap-2">
            {step < 2 ? (
              <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={next}>
                下一步
              </button>
            ) : null}
            {step === 2 ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => void submit()}
              >
                提交创建
              </button>
            ) : null}
            {step === 3 ? (
              <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={onClose}>
                完成
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      {children}
    </div>
  );
}
