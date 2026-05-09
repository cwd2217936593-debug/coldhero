import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import "@/index.css";

async function bootstrap() {
  // VITE_USE_MOCK=1 时启用前端 mock：拦截 axios + fetch + WebSocket，
  // 让前端不依赖后端独立可跑。（须包在 async 函数内，避免生产构建 target=es2020 时顶层 await 报错）
  if (import.meta.env.VITE_USE_MOCK === "1") {
    await import("@/mock");
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
