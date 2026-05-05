# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Manifest V3 Chrome extension for SEO outlink automation. It collects backlink candidates from Ahrefs, scores them for spam/quality, and can auto-publish to Product Hunt using AI-generated copy via OpenRouter.

## Loading the Extension

There is no build step. Load the extension directly from this directory in Chrome:

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After any file change, click the reload icon on the extension card

## Architecture

The extension has two parallel UI generations (v1 and v2). **Only v2 is active** per `manifest.json`:

| File | Role |
|------|------|
| `background-v2.js` | Service worker (active). All business logic lives here: DB access, spam scoring, collection state, Product Hunt autofill orchestration, OpenRouter API calls. |
| `panel.html` / `panel.js` / `panel.css` | Side panel UI (active). Opens when the toolbar icon is clicked. |
| `popup.html` / `popup.js` / `popup.css` | Old popup UI (inactive, not referenced by manifest). |
| `background.js` | Old service worker (inactive). |
| `content/interceptor.js` | Content script injected on `ahrefs.com`. Injects `page-hook.js` into page context, scrapes table rows via DOM, auto-paginates, and relays payloads to the service worker via `chrome.runtime.sendMessage`. |
| `content/page-hook.js` | Runs in page context (not extension context). Patches `window.fetch` and `XMLHttpRequest` to intercept Ahrefs API responses and relay URLs via `window.postMessage`. |
| `content/producthunt-publisher.js` | Content script on `producthunt.com`. Listens for `PRODUCTHUNT_AUTOFILL` messages and fills the submission form. |

## Data Flow

1. User enters a target domain in the side panel and clicks "开始收集"
2. Background opens `ahrefs.com/backlink-checker/?input=<domain>` in a new tab
3. `interceptor.js` activates on that tab: injects `page-hook.js` (fetch/XHR patching) and starts DOM auto-pagination
4. Extracted URLs/items are sent to background via `NETWORK_BACKLINKS_PAYLOAD`
5. Background scores each item (spam score, blog-comment detection, no-register detection) and stores in `chrome.storage.local` under key `outlink_db_v2`
6. Side panel polls background every 2.5s via `GET_COLLECTION_STATE` and `GET_RESOURCES` to refresh the UI

## Storage Schema (`outlink_db_v2`)

```
{
  tables: { collection[], publish[], logs[], resources[] },
  publishConfig: { openrouterApiKey, openrouterModel, autoSubmitProductHunt },
  publishState: { productHuntPending },
  collectionState: { targetDomain, status, counts, queue[], seenByUrl{}, recent[] }
}
```

Resources are deduplicated by `targetDomain|url` key, keeping the most recently updated record. The cap is 5000 resources.

## Message Protocol

All communication uses `chrome.runtime.sendMessage` with an `action` string. Defined actions in `background-v2.js`:

- `COLLECTION_START` / `COLLECTION_STOP` / `GET_COLLECTION_STATE`
- `GET_TABLE_COUNTS` / `GET_RESOURCES`
- `NETWORK_BACKLINKS_PAYLOAD` — sent by content scripts with extracted backlink data
- `RESET_DEMO_DATA`
- `GET_BACKUP_PAYLOAD` / `IMPORT_BACKUP_PAYLOAD` / `IMPORT_RESOURCES_ROWS`
- `GET_PUBLISH_CONFIG` / `SAVE_PUBLISH_CONFIG`
- `GENERATE_PRODUCTHUNT_DRAFT` / `OPEN_AND_FILL_PRODUCTHUNT`

Content script `producthunt-publisher.js` separately handles `PRODUCTHUNT_AUTOFILL` sent directly from the service worker to the tab.

## Key Implementation Details

- **Spam scoring** (`evaluateSpam` in `background-v2.js`): keyword blocklist + suspicious TLDs + DR/traffic signals → score 0–100; `isNonSpam = score < 40`
- **Blog comment detection** (`evaluateNoRegisterBlogComment`): URL path heuristics; `noRegisterLikely` indicates sites that likely allow anonymous comments
- **Product Hunt publishing**: background opens `producthunt.com/posts/new`, retries `PRODUCTHUNT_AUTOFILL` up to 40 times with 500ms–900ms delays to handle multi-step form navigation
- **OpenRouter integration**: `generateProductHuntDraft` in `background-v2.js` calls `openrouter.ai/api/v1/chat/completions`; default model is `google/gemini-2.0-flash-001`
- `content/page-hook.js` runs in page context (not extension context) to bypass the extension content script sandbox and access `window.fetch` directly; it communicates back to `interceptor.js` via `window.postMessage`
