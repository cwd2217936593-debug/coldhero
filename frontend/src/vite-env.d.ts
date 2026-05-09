/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  /** 混合模式：Mock 打开时，将此前缀指向真实后端（须 CORS），管理员/企业版可走真实 DeepSeek 问答 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
