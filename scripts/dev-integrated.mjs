import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(
  root,
  "backend/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const neon = process.argv.includes("--neon");
console.log(
  neon
    ? "Starting Clyra with the configured persistent Neon database."
    : "Starting Clyra with an isolated temporary test database.",
);
const apiPort = neon ? "8001" : "8000";
const backend = spawn(
  python,
  [
    "-m",
    "uvicorn",
    neon ? "app.main:app" : "scripts.integration_app:app",
    "--host",
    "127.0.0.1",
    "--port",
    apiPort,
  ],
  { cwd: path.join(root, "backend"), stdio: "inherit" },
);
const frontend = spawn(
  process.execPath,
  [
    path.join(root, "frontend/node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5177",
    "--strictPort",
  ],
  {
    cwd: path.join(root, "frontend"),
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_API_BASE_URL: "/api/v1",
      VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    },
  },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  backend.kill();
  frontend.kill();
}
for (const child of [backend, frontend]) {
  child.on("error", (e) => {
    console.error(e.message);
    stop();
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    if (!stopping) {
      stop();
      process.exitCode = code ?? 1;
    }
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
