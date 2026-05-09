import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import "@/index.css";

// VITE_USE_MOCK=1 时启用前端 mock：拦截 axios + fetch + WebSocket，
// 让前端不依赖后端独立可跑。
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
