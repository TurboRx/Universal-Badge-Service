Universal Badge Service
===

Table of Contents
---
- [Overview](#overview)
- [Options](#options)
- [Architecture](#architecture)
- [API Specification](#api-specification)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

Overview
---
Universal Badge Service is a stateless Node.js microservice that generates crisp, responsive SVG badges using the GitHub REST API.

Options
---
Supported badge types:
- `stars`: Stargazers count
- `forks`: Forks count
- `issues`: Open issues & PRs search count
- `open-issues`: Repository open issues count
- `prs`: Open pull requests count
- `contributors`: Contributor count
- `commits`: Total commit count
- `last-commit`: Date of the latest commit (YYYY-MM-DD)
- `release`: Latest release tag name
- `watchers`: Repository watchers count
- `license`: Repository license (SPDX identifier or name)
- `size`: Repository size formatted (KB / MB)
- `language`: Primary repository language

Visual configuration:
- `label`: Override the default badge label
- `color`: Hex color code (e.g. `ffd700`, `#ff5722`) or CSS named color (`blue`, `crimson`, etc.)
- `labelColor`: Hex color or CSS named color for the left segment (default: `#555`)
- `style`: `flat` (default), `flat-square`, `plastic`, `for-the-badge`
- `cacheSeconds`: Custom HTTP Cache-Control max-age header (default: `300`)

Architecture
---
- Uses `node:http` to minimize overhead and eliminate framework bloat.
- SVG rendering uses `<clipPath>` for clean, gapless rounded corners.
- In-memory TTL cache reduces GitHub API requests and mitigates rate limiting.
- Supports CORS (`Access-Control-Allow-Origin: *`), `HEAD` requests, and `.svg` URL extensions.
- Strict TypeScript configuration enforced via [tsconfig.json](tsconfig.json).

API Specification
---
URI patterns:
- `/{owner}/{repo}/{type}`
- `/{owner}/{repo}/{type}.svg`

Example Requests:
```
GET /TurboRx/CSS-Gradient-Generator/stars
GET /TurboRx/CSS-Gradient-Generator/license.svg?color=emerald&labelColor=333
GET /TurboRx/Universal-Badge-Service/watchers?style=for-the-badge
```

Testing
---
Run unit tests:
```bash
npm test
```

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

License
---
Licensed under the MIT License. See [LICENSE](LICENSE).



