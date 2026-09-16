import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_API_PROXY?.trim();
  const analyticsWorker = env.VITE_ANALYTICS_WORKER_URL?.trim() || "http://127.0.0.1:8788";
  // Server-only pilot token — never expose via VITE_* / import.meta.env.
  const pilotToken = env.WYZ_PILOT_API_TOKEN?.trim();

  const analyticsProxy = {
    target: analyticsWorker,
    changeOrigin: true,
    configure: (proxy) => {
      if (!pilotToken) return;
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.setHeader("X-WYZ-Pilot-Token", pilotToken);
      });
    },
  };

  const proxy = {
    "/api/v1/analytics": analyticsProxy,
  };
  if (proxyTarget) {
    proxy["/api"] = {
      target: proxyTarget,
      changeOrigin: true,
    };
  }

  return {
    plugins: [react()],
    server: {
      proxy,
      // Runtime analytics data must not trigger Vite/HMR rebuilds.
      // Application code still reads these paths via the Python worker HTTP API.
      watch: {
        ignored: [
          "**/.wyz-analytics-work/**",
          "**/services/analytics/.wyz-analytics-work/**",
          "**/.benchmark-results/**",
          "**/services/analytics/.benchmark-results/**",
          "**/node_modules/**",
          "**/dist/**",
          "**/build/**",
          "**/__pycache__/**",
          "**/.pytest_cache/**",
          "**/*.parquet",
        ],
      },
    },
  };
});
