import axios, { type AxiosInstance } from "axios";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { pathToFileURL } from "node:url";

type BadgePayload = {
  label: string;
  message: string;
  color: string;
  labelColor?: string;
  style?: string;
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
  subscribers_count?: number;
  watchers_count?: number;
  size?: number;
  language?: string | null;
  license?: {
    spdx_id?: string;
    name?: string;
  } | null;
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

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedValue<unknown>>();

const badgeColors: Record<string, string> = {
  stars: "ffd700",
  forks: "3cb371",
  issues: "d73a4a",
  "open-issues": "d73a4a",
  prs: "6f42c1",
  contributors: "1f6feb",
  commits: "2da44e",
  "last-commit": "0f4c81",
  release: "8250df",
  watchers: "007ec6",
  license: "4c1",
  size: "97ca00",
  language: "3178c6"
};

const CSS_NAMED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue",
  "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon",
  "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick",
  "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
  "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo",
  "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue",
  "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen",
  "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
  "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
  "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite",
  "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink",
  "plum", "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue",
  "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver",
  "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue",
  "tan", "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white",
  "whitesmoke", "yellow", "yellowgreen"
]);

const githubClient = createGithubClient();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!req.url) {
    respondWithSvg(res, 400, buildBadge({ label: "badge", message: "missing url", color: "d73a4a" }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length === 0 || url.pathname === "/" || url.pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      status: "ok",
      service: "Universal Badge Service",
      version: "2.1.0",
      endpoints: "/:owner/:repo/:badgeType",
      supportedBadges: Object.keys(badgeColors)
    }, null, 2));
    return;
  }

  if (pathParts.length !== 3) {
    respondWithSvg(res, 404, buildBadge({ label: "badge", message: "not found", color: "d73a4a" }));
    return;
  }

  const owner = pathParts[0];
  const repo = pathParts[1];
  // Strip optional .svg extension from badgeType if present
  const rawBadgeType = pathParts[2];
  const badgeType = rawBadgeType.replace(/\.svg$/i, "").toLowerCase();

  const colorParam = url.searchParams.get("color");
  const labelColorParam = url.searchParams.get("labelColor");
  const color = colorParam ?? badgeColors[badgeType] ?? "0f4c81";
  const labelColor = labelColorParam ?? "555";
  const label = url.searchParams.get("label") ?? badgeType;
  const style = url.searchParams.get("style") ?? "flat";
  const cacheSeconds = Number.parseInt(url.searchParams.get("cacheSeconds") ?? "300", 10);
  const maxAge = Number.isNaN(cacheSeconds) ? 300 : Math.max(0, Math.min(86400, cacheSeconds));

  try {
    const payload = await resolveBadgePayload(owner, repo, badgeType, label, color, labelColor);
    respondWithSvg(res, 200, buildBadge({ ...payload, style }), req.method === "HEAD", maxAge);
  } catch (error) {
    const apiError = toApiError(error);
    const status = apiError.status === 404 ? 404 : 500;
    respondWithSvg(res, status, buildBadge({
      label: badgeType,
      message: apiError.message,
      color: "d73a4a",
      labelColor,
      style
    }), req.method === "HEAD", maxAge);
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
  color: string,
  labelColor: string
): Promise<BadgePayload> {
  const key = `badge:${badgeType}:${owner}/${repo}`;
  const cached = getCacheValue<BadgePayload>(key);
  if (cached) {
    return { ...cached, label, color, labelColor };
  }

  const payload = await fetchBadgePayload(owner, repo, badgeType, label, color, labelColor);
  setCacheValue(key, payload);
  return payload;
}

async function fetchBadgePayload(
  owner: string,
  repo: string,
  badgeType: string,
  label: string,
  color: string,
  labelColor: string
): Promise<BadgePayload> {
  switch (badgeType) {
    case "stars": {
      const repoData = await fetchRepo(owner, repo);
      return { label, message: formatNumber(repoData.stargazers_count), color, labelColor };
    }
    case "forks": {
      const repoData = await fetchRepo(owner, repo);
      return { label, message: formatNumber(repoData.forks_count), color, labelColor };
    }
    case "issues": {
      const count = await fetchSearchCount(`${owner}/${repo}`, "issue", "open");
      return { label, message: formatNumber(count), color, labelColor };
    }
    case "open-issues": {
      const repoData = await fetchRepo(owner, repo);
      return { label, message: formatNumber(repoData.open_issues_count), color, labelColor };
    }
    case "watchers": {
      const repoData = await fetchRepo(owner, repo);
      const watchers = repoData.subscribers_count ?? repoData.watchers_count ?? 0;
      return { label, message: formatNumber(watchers), color, labelColor };
    }
    case "license": {
      const repoData = await fetchRepo(owner, repo);
      const lic = repoData.license?.spdx_id ?? repoData.license?.name ?? "No License";
      return { label, message: lic, color, labelColor };
    }
    case "size": {
      const repoData = await fetchRepo(owner, repo);
      return { label, message: formatSize(repoData.size ?? 0), color, labelColor };
    }
    case "language": {
      const repoData = await fetchRepo(owner, repo);
      return { label, message: repoData.language ?? "None", color, labelColor };
    }
    case "prs": {
      const count = await fetchSearchCount(`${owner}/${repo}`, "pr", "open");
      return { label, message: formatNumber(count), color, labelColor };
    }
    case "contributors": {
      const count = await fetchPagedCount(`/repos/${owner}/${repo}/contributors?per_page=1&anon=1`);
      return { label, message: formatNumber(count), color, labelColor };
    }
    case "commits": {
      const count = await fetchPagedCount(`/repos/${owner}/${repo}/commits?per_page=1`);
      return { label, message: formatNumber(count), color, labelColor };
    }
    case "last-commit": {
      const date = await fetchLastCommitDate(owner, repo);
      return { label, message: date, color, labelColor };
    }
    case "release": {
      const tag = await fetchLatestRelease(owner, repo);
      return { label, message: tag, color, labelColor };
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

function formatSize(kb: number): string {
  if (kb < 1024) {
    return `${kb} KB`;
  }
  if (kb < 1024 * 1024) {
    return `${(kb / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
  }
  return `${(kb / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} GB`;
}

export function normalizeColor(input: string, defaultColor: string = "555"): string {
  if (!input) return `#${defaultColor.replace(/^#/, "")}`;
  const clean = input.trim().toLowerCase();
  
  if (CSS_NAMED_COLORS.has(clean)) {
    return clean;
  }

  const hexClean = clean.replace(/^#/, "");
  if (/^[0-9a-f]{3,8}$/i.test(hexClean)) {
    return `#${hexClean}`;
  }

  return `#${defaultColor.replace(/^#/, "")}`;
}

export function buildBadge(payload: BadgePayload): string {
  const label = escapeXml(payload.label);
  const message = escapeXml(payload.message);
  const style = (payload.style ?? "flat").toLowerCase();
  const isForTheBadge = style === "for-the-badge";
  const height = isForTheBadge ? 28 : 20;
  const fontSize = isForTheBadge ? 12 : 11;
  const textY = isForTheBadge ? 19 : 14;
  const labelText = isForTheBadge ? label.toUpperCase() : label;
  const messageText = isForTheBadge ? message.toUpperCase() : message;
  const labelWidth = Math.max(35, labelText.length * 6.5 + 14);
  const messageWidth = Math.max(35, messageText.length * 6.5 + 14);
  const totalWidth = labelWidth + messageWidth;
  const rx = style === "flat-square" || isForTheBadge ? 0 : 3;
  const usePlastic = style === "plastic";

  const msgColor = normalizeColor(payload.color, "0f4c81");
  const lblColor = normalizeColor(payload.labelColor ?? "555", "555");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${labelText}: ${messageText}">
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="${rx}"/>
  </clipPath>
  <linearGradient id="a" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity="0.1"/>
    <stop offset="1" stop-opacity="0.1"/>
  </linearGradient>${usePlastic ? `
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity="0.7"/>
    <stop offset="0.5" stop-opacity="0.1"/>
    <stop offset="1" stop-opacity="0"/>
  </linearGradient>` : ""}
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="${lblColor}"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="${height}" fill="${msgColor}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#a)"/>
${usePlastic ? `    <rect width="${totalWidth}" height="${height}" fill="url(#b)"/>` : ""}
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="${textY}">${labelText}</text>
    <text x="${labelWidth + messageWidth / 2}" y="${textY}">${messageText}</text>
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
  cache.set(key, { value, expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS });
}

function respondWithSvg(
  res: ServerResponse,
  status: number,
  svg: string,
  isHead: boolean = false,
  maxAge: number = 300
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge}`);
  if (isHead) {
    res.setHeader("Content-Length", Buffer.byteLength(svg));
    res.end();
  } else {
    res.end(svg);
  }
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

