import "dotenv/config";
import { startScheduler } from "./src/scheduler.js";
import { startServer } from "./src/server.js";

startScheduler();
startServer();
