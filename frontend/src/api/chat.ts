import { api } from "@/api/client";
import { getExternalApiOrigin, getTokenForChatGate, shouldChatStreamHitRealBackend } from "@/lib/deepseekBridge";
import type { ApiResp, ChatLog, SessionSummary } from "@/api/types";

export async function listSessions(): Promise<SessionSummary[]> {
  const r = await api.get<ApiResp<SessionSummary[]>>("/chat/sessions");
  return r.data.data;
}

export async function listMessages(sessionId: string): Promise<ChatLog[]> {
  const r = await api.get<ApiResp<ChatLog[]>>(`/chat/sessions/${sessionId}/messages`);
  return r.data.data;
}

export interface AskOptions {
  sessionId?: string;
  question: string;
  model?: "fast" | "pro";
  /** 收到 delta 时回调（追加打字机文本） */
  onDelta: (delta: string) => void;
  /** 收到 start 时回调（拿到 sessionId 用于回填 URL） */
  onStart?: (info: { sessionId: string; logId: number; tier: string }) => void;
  /** 收到 end 时回调 */
  onEnd?: (info: { sessionId: string; latencyMs: number; model: string }) => void;
  /** 错误时回调 */
  onError?: (msg: string) => void;
  /** AbortController 信号 */
  signal?: AbortSignal;
}

/**
 * 流式接口始终直连 VITE_API_BASE_URL（混合模式），避免经 Vite 反代时部分环境下 SSE 被缓冲/截断。
 * 后端 APP_CORS_ORIGINS 须包含当前页面来源（localhost / 127.0.0.1 及端口）。
 */
function chatStreamEndpoint(): string {
  if (shouldChatStreamHitRealBackend()) {
    const o = getExternalApiOrigin()!;
    return `${o}/api/chat/messages/stream`;
  }
  return "/api/chat/messages/stream";
}

export async function askStream(opts: AskOptions): Promise<void> {
  const token = getTokenForChatGate();
  if (shouldChatStreamHitRealBackend() && token?.startsWith("mock.")) {
    opts.onError?.(
      "混合模式需要真实登录：请点击「退出登录」，再用管理员账号登录以获取 JWT（勿使用仅 Mock 登录留下的 token）。",
    );
    return;
  }
  const res = await fetch(chatStreamEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
    body: JSON.stringify({
      sessionId: opts.sessionId,
      question: opts.question,
      model: opts.model,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = JSON.parse(text)?.message ?? text;
    } catch {/* ignore */}
    opts.onError?.(msg || `HTTP ${res.status}`);
    return;
  }
  if (!res.body) {
    opts.onError?.("无响应体");
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith("data:")) continue;
      const dataStr = line.slice(5).trim();
      if (dataStr === "[DONE]") return;
      try {
        const obj = JSON.parse(dataStr);
        if (obj.type === "start") opts.onStart?.(obj);
        else if (obj.type === "delta") opts.onDelta(obj.delta ?? "");
        else if (obj.type === "end") opts.onEnd?.(obj);
        else if (obj.type === "error") opts.onError?.(obj.message ?? "stream_failed");
      } catch {/* ignore parse error */}
    }
  }
}
