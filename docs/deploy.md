# Deploy

This document tells you how to deploy the API and web apps and how to check a deployed stack. It covers the container images that the Release workflow publishes and the `release/<app>` branches that it updates. It does not choose a hosting platform for you.

## What the Release workflow publishes

The Release workflow (`.github/workflows/release.yml`) runs on every push to `main`. When a merged version PR creates an app version tag, the workflow does these steps for each tagged app:

1. It builds the image from `Dockerfile.<app>` at the tag `@repo/<app>@<version>`.
2. It scans the image with the same Trivy gate as the PR `docker-images` job. A fixable CRITICAL vulnerability fails the job, and no image is pushed.
3. It pushes the scanned image to GitHub Container Registry (GHCR).
4. It adds the image digest to the job summary and to the GitHub Release notes of that tag.
5. It attaches an SPDX JSON SBOM of the pushed image to the GitHub Release as `sbom-<app>.spdx.json`.

| App | Tag           | Image                        | Image tags                           |
| --- | ------------- | ---------------------------- | ------------------------------------ |
| API | `@repo/api@x` | `ghcr.io/<owner>/<repo>-api` | `<version>`, `sha-<7-character SHA>` |
| Web | `@repo/web@x` | `ghcr.io/<owner>/<repo>-web` | `<version>`, `sha-<7-character SHA>` |

Owner and repository names are lowercase in the image name. The workflow pushes no image from pull requests, from forks, from a ref other than `main`, or from a run that created no app tag.

GHCR makes a new package private. To pull it, log in with a token that has `read:packages`, or make the package public in its package settings on GitHub.

The same run also updates `release/<app>` for each affected app with `pnpm release:apps`. Only the Release workflow or a human operator runs `pnpm release:apps`. An agent never runs it, not even with `--dry-run`.

## Choose what to deploy from

Use one of these two sources. Do not mix them for one app.

- **Image tag.** Pull `ghcr.io/<owner>/<repo>-<app>:<version>`. For a reproducible deploy, pin the digest from the GitHub Release notes: `ghcr.io/<owner>/<repo>-<app>@sha256:<digest>`. Use this source when your platform runs a prebuilt image.
- **`release/<app>` branch.** Point your platform at `release/api` or `release/web` and let it build `Dockerfile.api` or `Dockerfile.web` on each push. The branch moves only when that app is affected. Use this source when your platform builds from Git, or when you need web build arguments that the published image does not set (see below).

## Runtime environment

`.env.example` lists every variable with a comment. `MONOREPO_GUIDE.md` section 9 is the authority for their behavior. This section lists what each image needs at runtime.

### API image

The image sets `NODE_ENV=production` and listens on port `4000` on all interfaces. Its health check calls `GET /health`.

Required:

- `DATABASE_URL`: the PostgreSQL connection string. Add `sslmode=verify-full` when the database needs verified TLS.
- `BETTER_AUTH_SECRET`: at least 32 characters, not a placeholder.
- `BETTER_AUTH_URL`: the public URL where browsers reach `/api/auth`. When browsers go through the web image's proxy, this is the web origin.
- `API_CORS_ORIGINS`: a comma-separated list of the browser origins. Production startup fails when it is empty. A missing web origin makes sign-in fail with `403 INVALID_ORIGIN`.
- `API_URL`: the public API URL.

Set these for a real deployment:

- `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`. The default `console` provider only writes emails to the log.
- `API_TRUST_PROXY=true`, only when every request reaches the API through a trusted proxy, such as the web image or a load balancer. Rate limits, Audit Event IP addresses, and session IP addresses then use the client address from `x-forwarded-for`.
- `API_TRUSTED_PROXY_HOPS`, the number of trusted proxies in front of the API. The default is `1`, the web image's nginx. Each proxy appends one `x-forwarded-for` entry, and the API takes the entry this many positions from the right. Set `2` when a platform proxy, such as Traefik on Dokploy, Caddy, or a CDN, sits in front of the web image: Traefik → nginx → API. When the value is too low, every user shares the proxy's address and one rate-limit bucket. When it is too high, a client can choose its own address. A request with fewer entries than this number uses the socket address. The count is safe only when every hop accepts traffic from the hop before it alone: with `2`, nginx must be reachable only through the platform proxy, not on a published port, and the API only through nginx. A client that reaches nginx directly can send its own `x-forwarded-for` entry, which the API then reads as the client address.
- `S3_*`, for Attachments and Public Assets. Storage features stay off without them.
- `API_RUN_MIGRATIONS`. See [Run database migrations](#run-database-migrations).

Optional: OAuth (`GITHUB_*`, `GOOGLE_*`), captcha (`TURNSTILE_*`), AI providers (`AI_*`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`), `LOG_LEVEL`, and error reporting (`OBSERVABILITY_*`, `SENTRY_DSN`, `OTEL_*`).

### Web image

The image serves the app with nginx on port `3000`. It needs one runtime variable:

- `API_BACKEND_URL`: the URL that nginx uses to reach the API, for example `http://api:4000`. nginx proxies `/graphql` and `/api/` to it. The default is `http://localhost:4000`, which does not work in a separate container.

Every response carries a `Content-Security-Policy`. Set these space-separated origin lists when they differ from the defaults, or the browser blocks the requests:

- `CSP_STORAGE_ORIGINS`: the S3 origins that presigned uploads and private-bucket thumbnails use, for example `https://my-bucket.s3.eu-central-1.amazonaws.com`. The default is `http://localhost:9000`, the `docker-compose.yml` storage.
- `CSP_PUBLIC_ASSET_ORIGINS`: the origin of `S3_PUBLIC_BASE_URL`. The default is `http://localhost:9000`.
- `CSP_API_ORIGINS`: the API's HTTP and WebSocket origins, for example `https://api.example.com wss://api.example.com`, only when the image is built with a cross-origin `VITE_API_URL`. The default is empty, because the app calls the API on its own origin.
- `CSP_BILLING_ORIGINS`: with `BILLING_PROVIDER=paddle`, set `https://*.paddle.com` so Paddle.js loads and its overlay checkout opens. The default is empty. Stripe needs nothing, because its checkout is a redirect.
- `BILLING_PAYMENT_ORIGINS`: the `Permissions-Policy` payment allowlist: `self`, then double-quoted origins, for example `self "https://buy.paddle.com" "https://sandbox-buy.paddle.com"`. Set it to allow wallet payments such as Apple Pay in the Paddle checkout. Keep `self`: a checkout frame gets the payment feature only when the page that embeds it has it too. The default is empty, which blocks the Payment Request API everywhere.

### Build-time `VITE_*` values

Vite writes every `VITE_*` value into the JavaScript bundle when the image is built. The container cannot change them at runtime.

The published web image is built with no `VITE_*` values:

- `VITE_API_URL` and `VITE_GRAPHQL_URL` are empty, so the app calls same-origin `/graphql` and `/api`. nginx sends those requests to `API_BACKEND_URL`. The browser never calls the API origin directly.
- `VITE_AUTH_SOCIAL_PROVIDERS` and `VITE_TURNSTILE_SITE_KEY` are empty, so the app shows no social sign-in buttons and no captcha widget. Keep `TURNSTILE_SECRET_KEY` empty on the API when you deploy the published web image. Otherwise the API asks for a captcha token that the web app cannot send.

When you need other values, build your own web image from `release/web` or from the tag. `Dockerfile.web` accepts `VITE_API_URL` and `VITE_GRAPHQL_URL` as build arguments. Add an `ARG` line to `Dockerfile.web` for any other `VITE_*` value that you need.

## Run database migrations

The API applies pending migrations from its bundled `packages/db/drizzle` folder before it starts to serve requests. `API_RUN_MIGRATIONS` controls this. In the image it defaults to `true`, because the image sets `NODE_ENV=production`.

- **Migrate at startup.** Keep the default. Each new API replica migrates the database and then starts. A Postgres advisory lock serializes the startup migrations, so the first replica applies them and replicas that start at the same time wait, then find nothing left to apply. Leave the old API running until the new one passes `GET /ready`.
- **Migrate as a separate release step.** Run the migrations once before the rollout, then start the replicas with `API_RUN_MIGRATIONS=false`. `pnpm db:migrate` does not take the advisory lock, so do not run it while an API with startup migrations is starting. From a checkout of the release tag, with `DATABASE_URL` pointing at the target database, run:

  ```bash
  pnpm db:migrate
  ```

Both paths use the same migration files and the same Drizzle migrations table. Take a database backup before a release that contains migrations. Migrations must stay compatible with the API version that is still running during the rollout.

## Check a deployed stack

`pnpm smoke:deployed` checks a running stack from outside. It passes only when all of these checks pass:

- `GET /health` on the API returns 200.
- `GET /ready` on the API returns 200. This proves that the API reaches the database.
- `GET /` on the web origin returns 200.
- An unauthenticated GraphQL request to `/graphql` on the web origin returns a GraphQL response. This proves that the web proxy reaches the API.

Run it locally:

```bash
pnpm smoke:deployed --web https://app.example.com --api https://api.example.com
```

The command prints `PASS` or `FAIL` for each check and exits non-zero when any check fails.

Run it from GitHub: open **Actions**, select **Deployed Check**, select **Run workflow**, and enter the web URL and the API URL. The runner must reach both URLs. When the API is not public, run the command from a host inside your network.

Run the check after each deploy, and before you send traffic to a new version.
