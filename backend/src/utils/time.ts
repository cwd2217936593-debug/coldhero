/**
 * 时区工具：所有"日"切分一律按 UTC+8（中国时区，与产品文档一致）
 * --------------------------------
 * 不引入额外插件，直接用纯 JS 偏移计算，避免 dayjs-tz 依赖系统时区数据。
 *
 *  - getUtc8DateString()  : 获取当前 UTC+8 的 'YYYY-MM-DD'
 *  - secondsToNextUtc8Midnight() : 距离下一个 UTC+8 00:00 的秒数（用于 Redis EXPIRE）
 *  - nextUtc8Midnight()   : 下一个 UTC+8 00:00 的真实 Date（响应给前端）
 */

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把真实 Date 转换成 UTC+8 "墙钟" 视角下的 Date（toISOString 即可拿到 UTC+8 字符串） */
function toUtc8Wall(d: Date = new Date()): Date {
  return new Date(d.getTime() + UTC8_OFFSET_MS);
}

/** 当前 UTC+8 日期 'YYYY-MM-DD' */
export function getUtc8DateString(d: Date = new Date()): string {
  return toUtc8Wall(d).toISOString().slice(0, 10);
}

/** 下一个 UTC+8 00:00 对应的真实 UTC Date */
export function nextUtc8Midnight(d: Date = new Date()): Date {
  const wall = toUtc8Wall(d);
  // 在墙钟上把时分秒清零并 +1 天
  wall.setUTCHours(0, 0, 0, 0);
  wall.setUTCDate(wall.getUTCDate() + 1);
  return new Date(wall.getTime() - UTC8_OFFSET_MS);
}

/** 距离下一个 UTC+8 00:00 的秒数（>=1，避免 EXPIRE 0 触发立即过期） */
export function secondsToNextUtc8Midnight(d: Date = new Date()): number {
  const ms = nextUtc8Midnight(d).getTime() - d.getTime();
  return Math.max(1, Math.ceil(ms / 1000));
}
