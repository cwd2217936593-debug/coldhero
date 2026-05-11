export type BackendDeepHealth = {
  ok: boolean;
  /** 人类可读，供登录页提示 */
  summary: string;
};

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 探测后端及 MySQL / Redis（走同源 /api，不经过 axios，避免 Mock/拦截器影响；代理失败时 Vite 会返回 JSON 503）
 */
export async function probeBackendDeep(): Promise<BackendDeepHealth> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch("/api/health/deep", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
    const text = await r.text();
    const data = parseJsonRecord(text);

    if (!data) {
      return {
        ok: false,
        summary: `HTTP ${r.status}，无法解析 JSON。响应片段：${text.slice(0, 180)}${text.length > 180 ? "…" : ""}`,
      };
    }

    if (r.status === 200 && data.success === true) {
      return { ok: true, summary: "后端、MySQL、Redis 已连通" };
    }

    const checks = data.checks as Record<string, { ok?: boolean; error?: string }> | undefined;
    if (checks && typeof checks === "object") {
      const bad = Object.entries(checks).filter(([, v]) => !v?.ok);
      const summary = bad.map(([k, v]) => `${k}：${v?.error ?? "不可用"}`).join("；");
      return {
        ok: false,
        summary: summary || `HTTP ${r.status}，依赖检查未通过`,
      };
    }

    const msg = typeof data.message === "string" ? data.message : null;
    if (msg) return { ok: false, summary: msg };

    return {
      ok: false,
      summary: `HTTP ${r.status}（${String(data.code ?? "no_code")}）`,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, summary: "探测超时：8 秒内无响应，请确认后端已启动。" };
    }
    return { ok: false, summary: e instanceof Error ? e.message : "探测失败" };
  } finally {
    clearTimeout(tid);
  }
}
