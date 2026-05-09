/**
 * WebSocket 网关
 * --------------------------------
 * 路径：ws://host/ws/sensors?token=<JWT>
 *
 * 握手：HTTP Upgrade 时校验 token；失败直接 close(1008, 'unauthorized')。
 *
 * 协议（JSON 文本帧）：
 *   Client → Server
 *     {"type":"subscribe","zoneIds":[1,2]}     仅接收指定库区（[] 或省略 = 全部）
 *     {"type":"ping"}
 *   Server → Client
 *     {"type":"welcome","userId":1,"zones":[1,2,3]}
 *     {"type":"sensor","zoneId":1,"data":{...}}
 *     {"type":"alert","zoneId":1,"level":"critical","reasons":[...],"data":{...}}
 *     {"type":"pong"}
 *
 * 心跳：服务端每 30s 主动 ping，60s 内未收到 pong 视为僵尸并断开。
 */

import { URL } from "node:url";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "@/utils/logger";
import { verifyToken, type JwtPayload } from "@/utils/jwt";
import { eventBus } from "@/realtime/eventBus";

const WS_PATH = "/ws/sensors";

interface ClientCtx {
  ws: WebSocket;
  user: JwtPayload;
  /** 订阅的 zoneId 集合，size=0 表示全部接收 */
  zones: Set<number>;
  alive: boolean;
}

const clients = new Set<ClientCtx>();

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function shouldDeliver(ctx: ClientCtx, zoneId: number): boolean {
  return ctx.zones.size === 0 || ctx.zones.has(zoneId);
}

/** 把 token 从 query string 取出 */
function extractToken(req: IncomingMessage): string | null {
  if (!req.url) return null;
  const u = new URL(req.url, "http://localhost");
  return u.searchParams.get("token") ?? null;
}

export function attachWsServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // 自定义 upgrade：路径白名单 + JWT 校验，失败立刻关闭
  server.on("upgrade", (req, socket, head) => {
    if (!req.url) {
      socket.destroy();
      return;
    }
    const u = new URL(req.url, "http://localhost");
    if (u.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    const token = extractToken(req);
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    let payload: JwtPayload;
    try {
      payload = verifyToken(token);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, payload);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, user: JwtPayload) => {
    const ctx: ClientCtx = { ws, user, zones: new Set(), alive: true };
    clients.add(ctx);

    send(ws, { type: "welcome", userId: Number(user.sub), zones: "all" });
    logger.info({ userId: user.sub, count: clients.size }, "WS 客户端已连接");

    ws.on("pong", () => {
      ctx.alive = true;
    });

    ws.on("message", (raw) => {
      let msg: { type?: string; zoneIds?: number[] };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "ping") {
        send(ws, { type: "pong" });
        return;
      }
      if (msg.type === "subscribe") {
        ctx.zones.clear();
        if (Array.isArray(msg.zoneIds)) {
          for (const id of msg.zoneIds) if (Number.isFinite(id)) ctx.zones.add(Number(id));
        }
        send(ws, { type: "subscribed", zoneIds: [...ctx.zones] });
      }
    });

    ws.on("close", () => {
      clients.delete(ctx);
      logger.info({ userId: user.sub, count: clients.size }, "WS 客户端断开");
    });

    ws.on("error", (err) => logger.warn({ err }, "WS 错误"));
  });

  // 心跳：每 30s ping，未存活则终止
  const heartbeat = setInterval(() => {
    for (const ctx of clients) {
      if (!ctx.alive) {
        ctx.ws.terminate();
        clients.delete(ctx);
        continue;
      }
      ctx.alive = false;
      try {
        ctx.ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, 30_000);
  heartbeat.unref();

  // 把事件总线消息分发给订阅者
  eventBus.onSensor((evt) => {
    for (const ctx of clients) {
      if (shouldDeliver(ctx, evt.zoneId)) {
        send(ctx.ws, {
          type: "sensor",
          zoneId: evt.zoneId,
          zoneCode: evt.zoneCode,
          data: evt.data,
        });
      }
    }
  });
  eventBus.onAlert((evt) => {
    for (const ctx of clients) {
      if (shouldDeliver(ctx, evt.zoneId)) {
        send(ctx.ws, {
          type: "alert",
          zoneId: evt.zoneId,
          zoneCode: evt.zoneCode,
          zoneName: evt.zoneName,
          level: evt.level,
          reasons: evt.reasons,
          data: evt.data,
        });
      }
    }
  });

  return wss;
}

export function getWsClientCount(): number {
  return clients.size;
}
