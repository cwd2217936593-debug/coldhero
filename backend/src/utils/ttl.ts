/**
 * 将配置中的「短 TTL 字符串」（与 jsonwebtoken 常见写法对齐）转成毫秒。
 * --------------------------------
 * 支持后缀：ms / s / m / h / d（区分大小写不敏感）。
 */

export function ttlStringToMs(raw: string): number {
  const s = raw.trim().toLowerCase();
  const m = /^(\d+)\s*(ms|[smhd])$/.exec(s);
  if (!m) {
    throw new Error(`无效的 TTL：${JSON.stringify(raw)}，示例：7200、「15m」「24h」「7d」`);
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`无效的 TTL 数值：${raw}`);
  switch (m[2]) {
    case "ms":
      return n;
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`不支持的 TTL 单位：${m[2]}`);
  }
}
