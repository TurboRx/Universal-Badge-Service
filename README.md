Universal Badge Service
===

Table of Contents
---
- [Overview](#overview)
- [Options](#options)
- [Architecture](#architecture)
- [API Specification](#api-specification)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

Overview
---
Universal Badge Service is a stateless Node.js microservice that generates SVG badges using the GitHub REST API.

Options
---
Telemetry and velocity metrics:
- `stars`
- `forks`
- `issues`
- `prs`
- `contributors`
- `commits`
- `last-commit`
- `release`

Visual configuration:
- `label`: override the default badge label
- `color`: hex color for the right-side segment (without `#`)
- `style`: `flat`, `flat-square`, `plastic`, `for-the-badge`

Architecture
---
- Uses `node:http` to minimize overhead and avoid heavy frameworks.
- In-memory TTL cache reduces GitHub API requests and mitigates rate limiting.
- Strict TypeScript configuration enforced via the repository [tsconfig.json](tsconfig.json).

API Specification
---
URI pattern:
- `/{owner}/{repo}/{type}`

Query schema:
- `label` (string)
- `color` (hex)
- `style` (enum)

Configuration
---
Environment variables:
- `GITHUB_TOKEN`: optional GitHub token to increase rate limits.

Deployment
---
Docker build:
```bash
docker build -t universal-badge-service .
```

Docker run:
```bash
docker run --rm -p 3000:3000 -e GITHUB_TOKEN=... universal-badge-service
```

Contributing
---
- Open an issue before proposing architectural changes.
- Code must comply with the existing `tsconfig.json` and repository patterns.

License
---
Licensed under the MIT License. See [LICENSE](LICENSE).


