import { api } from "@/api/client";
import { getExternalApiOrigin, shouldChatStreamHitRealBackend } from "@/lib/deepseekBridge";
import { useAuthStore } from "@/store/authStore";
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
 * 流式问答（手写 fetch + ReadableStream，自带 token；不依赖 EventSource）
 */
function chatStreamEndpoint(): string {
  if (shouldChatStreamHitRealBackend()) {
    const o = getExternalApiOrigin()!;
    return `${o}/api/chat/messages/stream`;
  }
  return "/api/chat/messages/stream";
}

export async function askStream(opts: AskOptions): Promise<void> {
  const token = useAuthStore.getState().token;
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
