import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
// 学生要认、记、写的英文用 Andika：为识字教学设计，a、g 是单层写法，I、l、1 分得清
import "@fontsource/andika/latin-400.css";
import "@fontsource/andika/latin-700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { watchForUpdates } from "./lib/update";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => null);
  });
}

// 发现服务器上有新版就自动换（微信缓存页面很久，不能指望学生手动刷新）
watchForUpdates();
