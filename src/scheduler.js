import { runGenerateScript } from "./runScript.js";

const INTERVAL = 4000; // 5 minutes
let running = false;

export function startScheduler() {
  console.log("⏱️ Scheduler started (every 5 minutes)");

  // Run once at startup
  runGenerateScript().catch(() => {});

  setInterval(async () => {
    if (running) {
      console.warn("⚠️ Previous run still in progress, skipping");
      return;
    }

    running = true;
    console.log("🔁 Regenerating badges...");

    try {
      await runGenerateScript();
    } finally {
      running = false;
    }
  }, INTERVAL);
}
