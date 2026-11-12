// Starts the project's private local Postgres (data in ./.pgdata, port 5433).
// Keep this terminal open while you work; press Ctrl+C to stop the database.
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";

const port = 5433;
const bin = process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";

if (!existsSync(".pgdata")) {
  console.error("No .pgdata folder here. Run this from the project root, or see the README to create the local database.");
  process.exit(1);
}

// Already running? Then there is nothing to do.
const inUse = await new Promise((resolve) => {
  const s = net.connect(port, "127.0.0.1");
  s.on("connect", () => (s.destroy(), resolve(true)));
  s.on("error", () => resolve(false));
});
if (inUse) {
  console.log(`Postgres is already running on port ${port}.`);
  process.exit(0);
}

// A leftover lock file after a crash would block startup; it is safe to remove when nothing is listening.
rmSync(".pgdata/postmaster.pid", { force: true });

const pg = spawn(`${bin}/postgres.exe`, ["-D", ".pgdata", "-p", String(port), "-c", "listen_addresses=127.0.0.1"], { stdio: "inherit" });
pg.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => pg.kill("SIGINT"));
