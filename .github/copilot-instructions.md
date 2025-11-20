# Copilot project instructions

This document teaches AI coding agents how to be productive in this repo quickly. Keep answers short and concrete; prefer editing files directly and verifying with lightweight runs.

## What this project is
- Cloudflare Workers project providing a DNS-over-HTTPS (DoH) proxy plus a small HTML UI.
- Key entrypoints:
  - `src/worker.js`: single worker handling fetch events, DoH proxy, `/ip-info` IP geolocation proxy, fallback routing.
  - `src/htmlTemplate.js`: assembles final HTML via `buildHTML({dohPath, upstreamHost})`, composing CSS/markup/client script from `src/ui/*`.
  - `src/ui/css.js`: exports `baseCSS`.
  - `src/ui/markup.js`: static HTML fragments (`formHTML`, `tabsHTML`, `tabContentHTML`, `pageShell`).
  - `src/ui/client.js`: front-end interactive JS packaged as a string by `clientScript(dohPathLiteral)`.
  - `wrangler.toml`: Cloudflare Wrangler config; name=`my-worker`, `workers_dev=true`, uses `CF_ACCOUNT_ID` from env.

## Runtime and routing
- Worker exports `default.fetch(request, env)`.
- Dynamic DoH upstream host is taken from `env.DOH`; path token from `env.PATH` or `env.TOKEN` falls back to `dns-query`.
- Requests:
  - `OPTIONS`: CORS preflight with permissive headers.
  - `/{PATH}`: DoH endpoint handled by `DOHRequest` (supports GET name=..., GET dns= base64, and POST application/dns-message). Upstream defaults to Cloudflare: `https://cloudflare-dns.com/{resolve|dns-query}`.
  - `?doh=...&domain=...&type=all|A|AAAA|NS`: JSON DNS query via `queryDns`/`handleLocalDohRequest`, merging A/AAAA/NS and exposing `{ipv4.records, ipv6.records, ns.records}`.
  - `/ip-info?ip=1.2.3.4&token=TOKEN`: HTTP ip-api.com geolocation via Worker-side fetch; requires `env.TOKEN` if set.
  - Fallback: if `env.URL302` -> 302 redirect; else if `env.URL` -> reverse proxy via `代理URL` (supports comma/quote/newline-separated list and random pick). Special `env.URL='nginx'` returns canned nginx HTML. Otherwise returns UI HTML from `buildHTML()` in `htmlTemplate.js`.

## Data flow and helpers
- `queryDns(doh, domain, type)`: Calls DoH JSON endpoint with several Accept header fallbacks; resilient to non-standard content-types, returns parsed JSON or throws.
- `DOHRequest(request)`: Forwards DoH requests, sets CORS headers on response and ensures JSON content-type for `name=` GET.
- `handleLocalDohRequest(domain, type)`: When `?doh` points to current host, it queries upstream `dnsDoH` directly and merges results for type=all.
- Reverse proxy: `代理URL(代理网址, 目标网址)` builds new URL by combining upstream path with incoming path/query and forwards; `整理` parses multi-delimiter lists.
- UI assets are now modularized: CSS/markup/client script under `src/ui/`; `buildHTML()` stitches them together. Worker passes `dohPath` and `upstreamHost`. UI still calls `./ip-info?ip=...&token=${PATH}`.

## Environment variables (Wrangler or Dashboard)
- `DOH`: Upstream DoH base; host portion is extracted if a full URL is given.
- `PATH` or `TOKEN`: Controls DoH path token (route becomes `/{PATH}`) and doubles as auth token for `/ip-info`.
- `URL302`: If set, responses default to 302 redirect to this URL when not hitting other handlers.
- `URL`: If set, non-DoH requests reverse-proxy to this URL (can be a list); literal `nginx` serves sample HTML.

## Local dev and deploy
- This repo has no package.json. Use Wrangler directly.
- Typical commands (PowerShell):
  - Preview: wrangler dev
  - Publish: wrangler publish
  - With env vars: $env:CF_ACCOUNT_ID='...' ; wrangler dev
- Ensure your Cloudflare account is logged in and CF_ACCOUNT_ID available.

## Conventions and gotchas
- CORS: All JSON/DoH responses set `Access-Control-Allow-Origin: *` and preflight handler is permissive.
- DoH path token normalization: if PATH contains '/', only segment after first slash is used.
- When `?doh` matches current host, use `handleLocalDohRequest` to avoid self-recursion.
- NS results may appear under Answer or Authority; code collects both and includes SOA(type=6) in combined Answer for visibility.
- UI highlights certain "blocked" IPs via hardcoded lists and still queries `/ip-info` for AS details.

## Make changes safely
- Keep `fetch()` responses setting CORS headers.
- If adding new endpoints, mirror the input style used elsewhere (query params, JSON) and:
  1. Update front-end interaction in `src/ui/client.js` (avoid changing server logic unless needed).
  2. Adjust markup fragments in `src/ui/markup.js`.
  3. Keep `buildHTML()` minimal—only composition glue.

## Front-end editing workflow
1. Change layout: edit `markup.js` fragments; keep placeholders stable for script selectors.
2. Adjust styles: edit `css.js` `baseCSS` (avoid huge inline duplication).
3. Modify interactions: update `client.js` inside `clientScript`; keep exported function signature.
4. Server side variable injection: only via parameters passed to `buildHTML()`—avoid interpolating inside fragment files directly.
5. For large refactors, consider moving client script out of string form and using a build step (not present yet) or serving it as a static asset via KV/R2 (future enhancement).
- For upstream changes, adjust `DoH`, `jsonDoH`, `dnsDoH` patterns consistently.

## Examples
- DoH JSON: GET `/{PATH}?name=example.com&type=A` -> upstream JSON.
- DNS multi-query: GET `/?doh=https%3A%2F%2Fdns.google%2Fresolve&domain=example.com&type=all`.
- Geo API: GET `/ip-info?ip=8.8.8.8&token=${PATH}`.

