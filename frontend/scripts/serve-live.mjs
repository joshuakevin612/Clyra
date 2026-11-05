import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5177",
    "--strictPort",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_API_BASE_URL: "/api/v1",
      VITE_API_PROXY_TARGET: process.argv.includes("--neon")
        ? "http://127.0.0.1:8001"
        : "http://127.0.0.1:8000",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill());
