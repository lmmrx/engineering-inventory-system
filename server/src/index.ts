import "dotenv/config";
import { createApp } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

// Last-resort safety net: log and keep running instead of crashing the whole
// server over one bad request that somehow slipped past the route-level
// asyncHandler wrappers and the app-level error middleware.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

const app = createApp();
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
