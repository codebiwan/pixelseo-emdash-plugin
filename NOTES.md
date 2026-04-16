# PixelSEO EmDash Plugin — Build Notes

## What This Is

An EmDash CMS plugin that brings pixelseo.ai's core capability — AI-generated, SEO-optimised images — to any EmDash-powered site. Users click "Generate" in the CMS editor, the plugin calls Imagen (Vertex AI) to create the image, then passes it to Claude Vision for alt text, description, filename, and JSON-LD schema.

**This plugin is completely separate from the pixelseo.ai site.** Nothing in `d:\YouFirst Files\pixelseo\pixelseo` was modified.

---

## File Structure

```
d:\YouFirst Files\pixelseo-plugin\
├── package.json           — npm package config, peer deps on emdash + react
├── tsconfig.json          — TypeScript config (ES2022, bundler moduleResolution)
├── NOTES.md               — this file
└── src/
    ├── descriptor.ts      — what EmDash sites import to register the plugin
    ├── index.ts           — plugin logic (runs in isolated Worker sandbox)
    ├── admin.tsx          — React admin UI (settings page + dashboard widget)
    └── lib/
        ├── vertex.ts      — Imagen image generation via Vertex AI
        └── seo.ts         — Claude Vision SEO metadata generation
```

---

## How EmDash Plugins Work (v0.1.0)

### The security model
Every plugin runs in an isolated V8 isolate (a "Dynamic Worker"). It can only access what it declares in `capabilities`. If a capability isn't declared, the corresponding `ctx.*` method is `undefined` at runtime.

### Key capabilities used by this plugin
| Capability | What it unlocks |
|---|---|
| `write:media` | `ctx.media.getUploadUrl(filename, mimeType)` |
| `write:content` | `ctx.content.update(collection, id, data)` |
| `network:fetch` | `ctx.http.fetch(url, options)` — scoped to `allowedHosts` |

### Plugin structure
```ts
import { definePlugin } from 'emdash';

export default definePlugin({
  id: 'my-plugin',
  version: '0.1.0',
  capabilities: ['write:media', 'network:fetch'],
  allowedHosts: ['api.example.com'],
  admin: { entry, pages, widgets },
  hooks: { 'content:afterSave': { handler } },
  routes: {
    'my-route': { handler: async (ctx) => { ... } }
  },
});
```

### Secrets / API keys
**There are no Cloudflare env vars or wrangler secrets for plugins.** Instead, secrets are stored in plugin-scoped KV storage via the admin settings UI:

```ts
// Save
await ctx.kv.set('settings:my_api_key', value);

// Load
const key = await ctx.kv.get<string>('settings:my_api_key');
```

The admin UI has a password field for each key. Blank = keep existing value, so keys aren't re-entered on every save.

### Media upload flow
There's no `ctx.media.upload(bytes)` — you get a signed URL instead:

```ts
const { uploadUrl, id } = await ctx.media.getUploadUrl(filename, mimeType);
await ctx.http.fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': mimeType },
  body: bytes,
});
// `id` is now the mediaId you can attach to content
```

### HTTP in the sandbox
All outbound HTTP must go through `ctx.http.fetch()`, not global `fetch`. The plugin declares `allowedHosts` — requests to any other hostname will fail.

```ts
allowedHosts: [
  'us-central1-aiplatform.googleapis.com',
  'oauth2.googleapis.com',
  'api.anthropic.com',
],
```

### Admin UI
Admin pages and widgets are React components exported from the admin entry file:

```ts
export const widgets: PluginAdminExports['widgets'] = { status: StatusWidget };
export const pages:   PluginAdminExports['pages']   = { '/settings': SettingsPage };
```

API calls from the admin UI hit plugin routes via:
```ts
import { apiFetch, parseApiResponse } from 'emdash/plugin-utils';
const res = await apiFetch('/_emdash/api/plugins/pixelseo/my-route', { ... });
```

### Two-file pattern
First-party EmDash plugins use two files:
- **`descriptor.ts`** — the shape the host site imports (`PluginDescriptor`), references the entrypoint by package name
- **`index.ts`** — the actual implementation (`ResolvedPlugin`), imported by the sandbox

```ts
// descriptor.ts — used in site config
export function pixelseoPlugin(): PluginDescriptor {
  return { id: 'pixelseo', entrypoint: '@pixelseo/emdash-plugin/plugin', ... };
}

// index.ts — runs in the sandbox
export function createPlugin(): ResolvedPlugin {
  return definePlugin({ ... });
}
```

---

## What Was Adapted From pixelseo Core

### `src/lib/vertex.ts`
- Changed `env: Env` (Cloudflare Workers binding) → `env: VertexEnv` (plain interface with 3 string fields)
- Added `fetchFn: typeof fetch` parameter — defaults to `globalThis.fetch` but accepts `ctx.http.fetch` from the plugin sandbox
- All `fetch()` calls now go through `fetchFn`

### `src/lib/seo.ts`
- Same `env` swap: `env: Env` → `env: SeoEnv` (just `ANTHROPIC_API_KEY`)
- Added optional `fetchFn` parameter passed to `new Anthropic({ fetch: fetchFn })`
- Removed pixelseo-specific `license` / `acquireLicensePage` / `creditText` from the JSON-LD schema (generic now)
- `imageUrl` is now nullable (pass `null` when you have bytes)

---

## Plugin Routes

| Route | Method | Purpose |
|---|---|---|
| `generate` | POST | Generate image + SEO metadata, upload to media library, optionally attach to content |
| `settings/save` | POST | Store API keys in KV |
| `settings/load` | POST | Return current settings (keys redacted — shows "set" boolean only) |
| `status` | POST | Returns `{ configured: boolean }` for dashboard widget |

### `generate` input shape
```json
{
  "prompt":      "A coastal landscape at golden hour",
  "orientation": "landscape",
  "format":      "webp",
  "style_hint":  "watercolor",
  "context":     "For a travel blog post",
  "collection":  "posts",
  "content_id":  "abc123"
}
```
`collection` and `content_id` are optional — if omitted, the image is uploaded to the media library but not attached to any content.

### `generate` response shape
```json
{
  "success":  true,
  "media_id": "uuid-from-emdash",
  "filename": "watercolor-coastal-landscape.webp",
  "seo": {
    "name":        "Watercolor Coastal Landscape at Golden Hour",
    "description": "...",
    "alt_text":    "...",
    "schema":      { "@context": "https://schema.org", "@type": "ImageObject", ... }
  }
}
```

---

## How to Register It in an EmDash Site

```ts
// astro.config.mjs (or emdash.config.ts)
import { pixelseoPlugin } from '@pixelseo/emdash-plugin';

export default defineConfig({
  plugins: [pixelseoPlugin()],
});
```

Then install the package:
```bash
npm install @pixelseo/emdash-plugin
# or, if local:
npm install ../pixelseo-plugin
```

---

## Still To Do / Test

- [ ] Install `emdash` package locally to typecheck (`npm install emdash` in the plugin dir — it's not on npm yet under that name, may need to link from the cloned repo)
- [ ] Verify `ctx.media.getUploadUrl` return shape matches `{ uploadUrl, id }` — read `packages/core` in the emdash repo to confirm
- [ ] Verify `PluginDescriptor` and `ResolvedPlugin` type imports compile against emdash v0.1.0
- [ ] Test the `generate` route end-to-end in a live EmDash instance
- [ ] Confirm `allowedHosts` wildcards (e.g. `oauth2.googleapis.com`) — the atproto plugin uses exact hostnames only
- [ ] Consider adding a `content:afterSave` hook so the plugin can auto-generate a featured image when a new post is published (optional feature)
- [ ] Publish to npm as `@pixelseo/emdash-plugin` once tested

---

## Reference: EmDash Plugin Examples in the Cloned Repo

Located at `d:\YouFirst Files\emdash\emdash\packages\plugins\`:

| Plugin | What to learn from it |
|---|---|
| `ai-moderation` | KV settings pattern, admin UI with widgets, routes |
| `atproto` | `ctx.http.fetch`, `ctx.storage.records`, two-file pattern |
| `api-test` | Full `ctx.*` API surface — every capability demonstrated |
| `webhook-notifier` | Simple network:fetch plugin, good minimal reference |
