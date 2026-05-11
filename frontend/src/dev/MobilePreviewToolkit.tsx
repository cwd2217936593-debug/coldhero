import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

/** 仅在开发构建显示：用 iframe 固定约 390px 宽，Tailwind `sm`/`lg` 等按该视口计算，等同电脑端仿真手机布局 */
export function MobilePreviewToolkit() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isEmbed = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("_embed") === "1";
    } catch {
      return false;
    }
  }, [location.search]);

  const iframeSrc = useMemo(() => {
    const u = new URL(`${window.location.origin}${location.pathname}`);
    const q = new URLSearchParams(location.search);
    q.delete("_embed");
    q.delete("simulateMobile");
    q.set("_embed", "1");
    u.search = q.toString();
    return `${u.pathname}${u.search}${location.hash}`;
  }, [location.pathname, location.search, location.hash]);

  /** 外链直达：/?simulateMobile=1 打开本页后立即弹出手机预览（仅开发） */
  useEffect(() => {
    if (!import.meta.env.DEV || isEmbed) return;
    const params = new URLSearchParams(location.search);
    if (params.get("simulateMobile") !== "1") return;
    setOpen(true);
    params.delete("simulateMobile");
    const qs = params.toString();
    const clean = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
    window.history.replaceState(null, "", clean);
  }, [location.pathname, location.search, location.hash, isEmbed]);

  if (!import.meta.env.DEV || isEmbed) return null;

  const fab = (
    <button
      type="button"
      title="在手机宽度 iframe 内打开当前路由；或在地址栏加 ?simulateMobile=1 自动弹出"
      onClick={() => setOpen(true)}
      className="fixed bottom-5 right-5 z-[9998] rounded-full bg-slate-900/88 px-3 py-2.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm ring-1 ring-white/15 transition hover:bg-slate-800"
    >
      手机预览
    </button>
  );

  if (!open) return fab;

  const overlay = (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/90 backdrop-blur-[2px]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 text-[11px] text-slate-200 sm:text-xs">
        <span className="min-w-0 leading-relaxed">
          电脑端仿真手机：<strong className="text-white">iframe 宽约 390px</strong>
          ，与真实窄屏一致的响应式规则；站内导航仅在框内跳转。
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white hover:bg-white/18"
        >
          退出
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6">
        <div
          className="relative w-[min(390px,calc(100vw-24px))] shrink-0 overflow-hidden rounded-[2.6rem] border-[12px] border-slate-800 bg-black shadow-[0_28px_100px_rgba(0,0,0,.5)] ring-1 ring-black/60"
          style={{ aspectRatio: "390 / 844", maxHeight: "calc(100dvh - 5rem)" }}
        >
          <iframe title="ColdHero 移动端预览" className="absolute inset-0 h-full w-full border-0" src={iframeSrc} />
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
