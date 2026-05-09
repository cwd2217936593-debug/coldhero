/**
 * 对象存储抽象
 * --------------------------------
 * 目标：业务代码不关心 OSS 还是本地磁盘，统一通过 StorageService 调用。
 *
 * - 当 .env 中配置了完整的 ALI_OSS_* 凭据时，自动启用 OssStorage
 * - 否则回退到 LocalStorage（开发态、Docker 单机运行）
 * - 所有上传产物都返回可直接展示的 URL（OSS 公网域名 / 本机 /uploads/* 静态路径）
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OSS from "ali-oss";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

export interface UploadResult {
  /** 业务库中持久化的"键"，前端不直接使用 */
  key: string;
  /** 可直接 <img src=...> 的 URL */
  url: string;
  /** 内容类型 */
  contentType: string;
  /** 字节数 */
  size: number;
}

export interface StorageService {
  /** 后端服务收到 multipart 文件后调用 */
  putBuffer(opts: { dir: string; filename: string; contentType: string; buffer: Buffer }): Promise<UploadResult>;
  /** 客户端直传 OSS 用：返回签名后的 PUT URL（无 OSS 时返回 null） */
  presignPut?(opts: { dir: string; filename: string; contentType: string; expiresSec?: number }): Promise<{ url: string; key: string; headers: Record<string, string> } | null>;
  /** 删除文件（best-effort） */
  remove(key: string): Promise<void>;
  /** 由 key 还原可访问 URL */
  toUrl(key: string): string;
  /** 后端类型描述（日志用） */
  readonly kind: "oss" | "local";
}

// =============================================================
// 工具：根据原始文件名生成存储键
// =============================================================

const SAFE_NAME_RE = /[^a-zA-Z0-9._-]/g;

export function buildKey(dir: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 8);
  const base = path.basename(originalName, ext).replace(SAFE_NAME_RE, "_").slice(0, 24);
  const ts = new Date();
  const yyyy = ts.getUTCFullYear();
  const mm = String(ts.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ts.getUTCDate()).padStart(2, "0");
  return `${dir.replace(/^\/+|\/+$/g, "")}/${yyyy}${mm}${dd}/${randomUUID()}_${base}${ext}`;
}

// =============================================================
// 阿里云 OSS 实现
// =============================================================

class OssStorage implements StorageService {
  readonly kind = "oss" as const;
  private client: OSS;
  private publicBase: string;

  constructor(opts: { region: string; bucket: string; ak: string; sk: string; endpoint: string; publicBase: string }) {
    this.client = new OSS({
      region: opts.region,
      bucket: opts.bucket,
      accessKeyId: opts.ak,
      accessKeySecret: opts.sk,
      endpoint: opts.endpoint || undefined,
      secure: true,
    });
    this.publicBase = opts.publicBase || `https://${opts.bucket}.${opts.endpoint.replace(/^https?:\/\//, "")}`;
  }

  toUrl(key: string): string {
    return `${this.publicBase.replace(/\/$/, "")}/${key.replace(/^\/+/, "")}`;
  }

  async putBuffer({ dir, filename, contentType, buffer }: { dir: string; filename: string; contentType: string; buffer: Buffer }): Promise<UploadResult> {
    const key = buildKey(dir, filename);
    await this.client.put(key, buffer, { headers: { "Content-Type": contentType, "x-oss-object-acl": "public-read" } });
    return { key, url: this.toUrl(key), contentType, size: buffer.byteLength };
  }

  async presignPut({ dir, filename, contentType, expiresSec = 600 }: { dir: string; filename: string; contentType: string; expiresSec?: number }) {
    const key = buildKey(dir, filename);
    const url = this.client.signatureUrl(key, {
      method: "PUT",
      expires: expiresSec,
      "Content-Type": contentType,
    } as unknown as Parameters<OSS["signatureUrl"]>[1]);
    return { url, key, headers: { "Content-Type": contentType } };
  }

  async remove(key: string): Promise<void> {
    try { await this.client.delete(key); } catch (e) { logger.warn({ err: e, key }, "OSS 删除失败"); }
  }
}

// =============================================================
// 本地磁盘实现（开发态后备）
// =============================================================

class LocalStorage implements StorageService {
  readonly kind = "local" as const;
  constructor(private rootDir: string, private publicPrefix: string) {}

  toUrl(key: string): string {
    return `${this.publicPrefix.replace(/\/$/, "")}/${key.replace(/^\/+/, "")}`;
  }

  async putBuffer({ dir, filename, contentType, buffer }: { dir: string; filename: string; contentType: string; buffer: Buffer }): Promise<UploadResult> {
    const key = buildKey(dir, filename);
    const abs = path.resolve(this.rootDir, key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return { key, url: this.toUrl(key), contentType, size: buffer.byteLength };
  }

  async remove(key: string): Promise<void> {
    try { await fs.unlink(path.resolve(this.rootDir, key)); } catch { /* ignore */ }
  }

  /** 本地不支持预签名直传（前端必须走 multipart 接口） */
  presignPut = undefined;

  /** 暴露给 app 注册 express.static() */
  get root() { return this.rootDir; }
  get prefix() { return this.publicPrefix; }
}

// =============================================================
// 工厂
// =============================================================

let _storage: StorageService | null = null;

export function getStorage(): StorageService {
  if (_storage) return _storage;

  const useOss = !!(env.ALI_OSS_BUCKET && env.ALI_OSS_ACCESS_KEY_ID && env.ALI_OSS_ACCESS_KEY_SECRET && env.ALI_OSS_REGION);

  if (useOss) {
    _storage = new OssStorage({
      region: env.ALI_OSS_REGION,
      bucket: env.ALI_OSS_BUCKET,
      ak: env.ALI_OSS_ACCESS_KEY_ID,
      sk: env.ALI_OSS_ACCESS_KEY_SECRET,
      endpoint: env.ALI_OSS_ENDPOINT,
      publicBase: env.ALI_OSS_PUBLIC_BASE_URL,
    });
    logger.info({ bucket: env.ALI_OSS_BUCKET, region: env.ALI_OSS_REGION }, "📦 对象存储：阿里云 OSS");
  } else {
    const root = path.resolve(process.cwd(), "storage", "uploads");
    _storage = new LocalStorage(root, "/uploads");
    logger.info({ root }, "📁 对象存储：本地磁盘（开发态后备）");
  }
  return _storage;
}

export function getLocalStorageRootIfAny(): { root: string; prefix: string } | null {
  const s = getStorage();
  return s instanceof LocalStorage ? { root: s.root, prefix: s.prefix } : null;
}
