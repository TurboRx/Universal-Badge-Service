import axios, { type AxiosInstance } from "axios";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { pathToFileURL } from "node:url";

type BadgePayload = {
  label: string;
  message: string;
  color: string;
};

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

type ApiError = {
  status: number;
  message: string;
};

type RepoResponse = {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
};

type CommitResponse = {
  commit: {
    author: {
      date: string;
    };
  };
};

type ReleaseResponse = {
  tag_name: string;
};

type SearchResponse = {
  total_count: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedValue<unknown>>();

const badgeColors: Record<string, string> = {
  stars: "ffd700",
  forks: "3cb371",
  issues: "d73a4a",
  prs: "6f42c1",
  contributors: "1f6feb",
  commits: "2da44e",
  "last-commit": "0f4c81",
  release: "8250df"
};

const githubClient = createGithubClient();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!req.url) {
    respondWithSvg(res, 400, buildBadge({ label: "badge", message: "missing url", color: "d73a4a" }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length !== 3) {
    respondWithSvg(res, 404, buildBadge({ label: "badge", message: "not found", color: "d73a4a" }));
    return;
  }

  const [owner, repo, badgeType] = pathParts;
  const color = url.searchParams.get("color") ?? badgeColors[badgeType] ?? "0f4c81";
  const label = url.searchParams.get("label") ?? badgeType;

  try {
    const payload = await resolveBadgePayload(owner, repo, badgeType, label, color);
    respondWithSvg(res, 200, buildBadge(payload));
  } catch (error) {
    const apiError = toApiError(error);
    const status = apiError.status === 404 ? 404 : 500;
    respondWithSvg(res, status, buildBadge({
      label: badgeType,
      message: apiError.message,
      color: "d73a4a"
    }));
  }
}

function createGithubClient(): AxiosInstance {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "universal-badge-service"
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return axios.create({
    baseURL: "https://api.github.com",
    headers,
    timeout: 8000,
    validateStatus: () => true
  });
}

async function resolveBadgePayload(
  owner: string,
  repo: string,
  badgeType: string,
  label: string,
  color: string
): Promise<BadgePayload> {
  const key = `badge:${badgeType}:${owner}/${repo}`;
  const cached = getCacheValue<BadgePayload>(key);
  if (cached) {
    return { ...cached, label, color };
  }

  const payload = await fetchBadgePayload(owner, repo, badgeType, label, color);
  setCacheValue(key, payload);
  return payload;
}

async function fetchBadgePayload(
  owner: string,
  repo: string,
  badgeType: string,
  label: string,
  color: string
): Promise<BadgePayload> {
  switch (badgeType) {
    case "stars": {
      const repoData = await fetchRepo(owner, repo);
      return { label, message: formatNumber(repoData.stargazers_count), color };
    }
    case "forks": {
      const repoData = await fetchRepo(owner, repo);
      return { label, message: formatNumber(repoData.forks_count), color };
    }
    case "issues": {
      const count = await fetchSearchCount(`${owner}/${repo}`, "issue", "open");
      return { label, message: formatNumber(count), color };
    }
    case "prs": {
      const count = await fetchSearchCount(`${owner}/${repo}`, "pr", "open");
      return { label, message: formatNumber(count), color };
    }
    case "contributors": {
      const count = await fetchPagedCount(`/repos/${owner}/${repo}/contributors?per_page=1&anon=1`);
      return { label, message: formatNumber(count), color };
    }
    case "commits": {
      const count = await fetchPagedCount(`/repos/${owner}/${repo}/commits?per_page=1`);
      return { label, message: formatNumber(count), color };
    }
    case "last-commit": {
      const date = await fetchLastCommitDate(owner, repo);
      return { label, message: date, color };
    }
    case "release": {
      const tag = await fetchLatestRelease(owner, repo);
      return { label, message: tag, color };
    }
    default:
      throw { status: 404, message: "unknown badge" } satisfies ApiError;
  }
}

async function fetchRepo(owner: string, repo: string): Promise<RepoResponse> {
  return fetchGithubJson<RepoResponse>(`/repos/${owner}/${repo}`);
}

async function fetchSearchCount(repoPath: string, type: "issue" | "pr", state: "open"): Promise<number> {
  const query = encodeURIComponent(`repo:${repoPath} type:${type} state:${state}`);
  const response = await fetchGithubJson<SearchResponse>(`/search/issues?q=${query}`);
  return response.total_count;
}

async function fetchLastCommitDate(owner: string, repo: string): Promise<string> {
  const response = await fetchGithubJson<CommitResponse[]>(`/repos/${owner}/${repo}/commits?per_page=1`);
  const date = response[0]?.commit.author.date;
  if (!date) {
    throw { status: 404, message: "no commits" } satisfies ApiError;
  }
  return new Date(date).toISOString().slice(0, 10);
}

async function fetchLatestRelease(owner: string, repo: string): Promise<string> {
  const response = await fetchGithubJson<ReleaseResponse>(`/repos/${owner}/${repo}/releases/latest`);
  if (!response.tag_name) {
    throw { status: 404, message: "no release" } satisfies ApiError;
  }
  return response.tag_name;
}

async function fetchPagedCount(endpoint: string): Promise<number> {
  const response = await githubClient.get<unknown[]>(endpoint);
  if (response.status >= 400) {
    throw { status: response.status, message: "upstream error" } satisfies ApiError;
  }

  const linkHeader = response.headers?.link as string | undefined;
  const lastPage = getLastPage(linkHeader);
  if (lastPage) {
    return lastPage;
  }

  return Array.isArray(response.data) ? response.data.length : 0;
}

async function fetchGithubJson<T>(endpoint: string): Promise<T> {
  const response = await githubClient.get<T>(endpoint);
  if (response.status >= 400) {
    throw { status: response.status, message: response.status === 404 ? "not found" : "upstream error" } satisfies ApiError;
  }

  return response.data;
}

function getLastPage(linkHeader: string | undefined): number | null {
  if (!linkHeader) {
    return null;
  }

  const match = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>\s*;\s*rel="last"/i);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

function formatNumber(value: number): string {
  if (value < 1000) {
    return value.toString();
  }

  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }

  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

function buildBadge(payload: BadgePayload): string {
  const label = escapeXml(payload.label);
  const message = escapeXml(payload.message);
  const labelWidth = Math.max(40, label.length * 6 + 14);
  const messageWidth = Math.max(40, message.length * 6 + 14);
  const totalWidth = labelWidth + messageWidth;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${message}">
  <linearGradient id="a" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity="0.1"/>
    <stop offset="1" stop-opacity="0.1"/>
  </linearGradient>
  <rect width="${labelWidth}" height="20" fill="#555"/>
  <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="#${payload.color}"/>
  <rect width="${totalWidth}" height="20" fill="url(#a)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${message}</text>
  </g>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getCacheValue<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

function setCacheValue<T>(key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function respondWithSvg(res: ServerResponse, status: number, svg: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.end(svg);
}

function toApiError(error: unknown): ApiError {
  if (typeof error === "object" && error && "status" in error && "message" in error) {
    const status = typeof (error as ApiError).status === "number" ? (error as ApiError).status : 500;
    const message = typeof (error as ApiError).message === "string" ? (error as ApiError).message : "error";
    return { status, message };
  }

  return { status: 500, message: "error" };
}

const isMain = pathToFileURL(process.argv[1] ?? "").href === import.meta.url;

if (isMain) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const server = createServer((req, res) => {
    void handler(req, res);
  });

  server.listen(port, () => {
    process.stdout.write(`badge service listening on ${port}\n`);
  });
}
