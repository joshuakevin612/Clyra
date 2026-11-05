import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
  { stdio: "inherit", env: { ...process.env, VITE_API_BASE_URL: "mock" } },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill());
