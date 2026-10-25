import "dotenv/config";
import { createApp } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

// Last-resort safety nets. A stray rejected promise is logged and the server
// carries on; a thrown exception that escaped every handler leaves the
// process in an unknown state, so it's logged and the process exits — the
// host (Render) restarts it cleanly within seconds.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception — restarting:", err);
  process.exit(1);
});

const app = createApp();
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
