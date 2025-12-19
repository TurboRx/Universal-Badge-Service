import express from "express";
import path from "path";

export function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const DOCS = path.resolve("./docs");

  // Serve generated SVGs + HTML
  app.use("/badges", express.static(DOCS, {
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-cache");
    }
  }));

  // Optional metadata endpoint
  app.get("/api/badges", (_, res) => {
    res.json({
      contributor: "/badges/contributor.svg",
      commits: "/badges/commits.svg",
      openPullRequests: "/badges/open-pull-requests.svg",
      lastCommit: "/badges/last-commit.svg",
      latestCommitPage: "/badges/latest-commit.html"
    });
  });

  app.get("/health", (_, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.listen(PORT, () => {
    console.log(`🚀 Badge server running at http://localhost:${PORT}`);
  });
}
