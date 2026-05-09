/**
 * 实时事件总线（基于 Redis Pub/Sub）
 * --------------------------------
 * 为什么用 Redis 而非 Node EventEmitter？
 *  - 后端可水平扩展为多实例（任意一实例发出的事件，其它实例的 WS 客户端都能收到）
 *  - 模拟数据脚本（独立进程）也能直接 publish，省去 HTTP 中转
 *
 * 频道设计：
 *  sensor:update   传感器数据点（含正常/异常） payload = SensorEvent
 *  sensor:alert    异常告警                    payload = AlertEvent
 */

import Redis from "ioredis";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { redis } from "@/db/redis";
import type { PublicSensor } from "@/modules/sensors/sensors.repository";

export const CH_SENSOR_UPDATE = "sensor:update";
export const CH_SENSOR_ALERT = "sensor:alert";

export interface SensorEvent {
  type: "sensor";
  zoneId: number;
  zoneCode: string;
  zoneName: string;
  data: PublicSensor;
}

export interface AlertEvent {
  type: "alert";
  zoneId: number;
  zoneCode: string;
  zoneName: string;
  level: "info" | "warning" | "critical";
  reasons: string[];
  data: PublicSensor;
}

type Listener<T> = (event: T) => void;

/**
 * 单例总线：内部维护一个独立 ioredis 订阅连接（订阅模式下连接不能再做命令）。
 * 业务侧调用 publish 走通用 redis 客户端；订阅则注册到本对象。
 */
class EventBus {
  private subscriber: Redis | null = null;
  private sensorListeners = new Set<Listener<SensorEvent>>();
  private alertListeners = new Set<Listener<AlertEvent>>();

  async start(): Promise<void> {
    if (this.subscriber) return;
    this.subscriber = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      lazyConnect: false,
    });
    this.subscriber.on("error", (err) => logger.error({ err }, "EventBus subscriber error"));
    await this.subscriber.subscribe(CH_SENSOR_UPDATE, CH_SENSOR_ALERT);
    this.subscriber.on("message", (channel, raw) => {
      try {
        const payload = JSON.parse(raw);
        if (channel === CH_SENSOR_UPDATE) {
          for (const cb of this.sensorListeners) cb(payload as SensorEvent);
        } else if (channel === CH_SENSOR_ALERT) {
          for (const cb of this.alertListeners) cb(payload as AlertEvent);
        }
      } catch (err) {
        logger.warn({ err, channel }, "EventBus 消息解析失败");
      }
    });
    logger.info("✅ EventBus 已订阅 sensor:update / sensor:alert");
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  async publishSensor(event: SensorEvent): Promise<void> {
    await redis.publish(CH_SENSOR_UPDATE, JSON.stringify(event));
  }

  async publishAlert(event: AlertEvent): Promise<void> {
    await redis.publish(CH_SENSOR_ALERT, JSON.stringify(event));
  }

  onSensor(cb: Listener<SensorEvent>): () => void {
    this.sensorListeners.add(cb);
    return () => this.sensorListeners.delete(cb);
  }

  onAlert(cb: Listener<AlertEvent>): () => void {
    this.alertListeners.add(cb);
    return () => this.alertListeners.delete(cb);
  }
}

export const eventBus = new EventBus();
