/**
 * PixelSEO — EmDash CMS Plugin (native format)
 *
 * Exports `createPlugin` for native-format registration by emdash.
 * Also exports named `routes` and `hooks` for reference.
 *
 * Handler signature: (routeCtx, pluginCtx) — two args, not one.
 *   routeCtx: { input, request, requestMeta }
 *   pluginCtx: { kv, media, content, http, log, storage, site, url }
 */

import { definePlugin } from 'emdash';
// Astro v6 + Cloudflare Workers: env bindings accessed via cloudflare:workers module
// (locals.runtime.env was removed in Astro v6)
import { env as cfWorkerEnv } from 'cloudflare:workers';

const PIXELSEO_API = 'https://pixelseo.ai';

// atob is a global in Cloudflare Workers but not in TypeScript's default lib
declare function atob(data: string): string;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const routes = {

  // -------------------------------------------------------------------------
  // generate — call pixelseo.ai API, upload image to emdash media library
  // -------------------------------------------------------------------------
  generate: {
    handler: async (
      routeCtx: { input: unknown },
      ctx: {
        kv: { get: <T>(key: string) => Promise<T | null> };
        media: { upload: (filename: string, contentType: string, bytes: Uint8Array) => Promise<{ id: string }> };
        http: { fetch: (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> };
        log: { info: (msg: string, data?: unknown) => void; error: (msg: string, data?: unknown) => void; warn: (msg: string, data?: unknown) => void };
      },
    ) => {
      const input = isRecord(routeCtx.input) ? routeCtx.input : {};

      const prompt      = str(input['prompt']);
      const orientation = str(input['orientation']) ?? 'landscape';
      const format      = str(input['format'])      ?? 'webp';

      if (!prompt?.trim()) return { success: false, error: 'prompt is required' };
      if (!['landscape', 'portrait', 'square'].includes(orientation))
        return { success: false, error: 'orientation must be landscape, portrait, or square' };
      if (!['webp', 'jpeg', 'png'].includes(format))
        return { success: false, error: 'format must be webp, jpeg, or png' };

      const apiKey = await ctx.kv.get<string>('settings:pixelseo_api_key');
      if (!apiKey) {
        return { success: false, error: 'PixelSEO is not configured. Enter your pixelseo.ai API key in settings.' };
      }

      // 1. Generate image via pixelseo.ai — request base64 bytes inline
      //    (sandbox cannot fetch binary via globalThis.fetch or ctx.http.fetch)
      let imageUrl: string;
      let filename: string;
      let altText: string;
      let schema: Record<string, unknown>;
      let creditsRemaining: number | null = null;
      let bytes: Uint8Array | undefined;
      let mimeType: string = `image/${format === 'jpeg' ? 'jpeg' : format}`;

      try {
        const res = await ctx.http.fetch(`${PIXELSEO_API}/api/v1/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({
            prompt_mode:   'custom',
            custom_prompt: prompt.trim(),
            orientation,
            output_format: format,
            include_bytes: 'true',
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          if (res.status === 402) return { success: false, error: 'Insufficient credits. Purchase more at pixelseo.ai/pricing.' };
          if (res.status === 401) return { success: false, error: 'Invalid API key. Check your pixelseo.ai API key in settings.' };
          return { success: false, error: `pixelseo.ai error ${res.status}: ${body}` };
        }

        const data = await res.json() as {
          image_url:        string;
          filename:         string;
          alt_text:         string;
          schema:           Record<string, unknown>;
          credits_remaining: number;
          image_base64?:    string;
          image_mime_type?: string;
        };
        imageUrl         = data.image_url;
        filename         = data.filename;
        altText          = data.alt_text;
        schema           = data.schema;
        creditsRemaining = data.credits_remaining ?? null;

        // Decode base64 image bytes returned inline
        if (data.image_base64) {
          ctx.log.info(`[pixelseo] got base64, length=${data.image_base64.length}, mime=${data.image_mime_type}`);
          const binaryStr = atob(data.image_base64);
          bytes    = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          mimeType = data.image_mime_type ?? mimeType;
          ctx.log.info(`[pixelseo] decoded bytes length=${bytes.length}`);
        } else {
          ctx.log.warn('[pixelseo] no image_base64 in response — media upload skipped');
        }
      } catch (err) {
        ctx.log.error('pixelseo.ai generate failed', err);
        return { success: false, error: 'Failed to reach pixelseo.ai. Check your connection and try again.' };
      }

      // 3. Upload to emdash media library (only if we got bytes from the API)
      // ctx.media.upload requires getUploadUrl to be set in PluginContextFactory,
      // which emdash's cloudflare adapter doesn't set for in-process plugins.
      // Fallback: access Cloudflare env directly via request locals (same pattern
      // as @emdash-cms/cloudflare vectorize-search plugin).
      let mediaId: string | undefined;
      if (bytes) {
        // Try standard ctx.media.upload first (works if emdash sets getUploadUrl)
        if (typeof (ctx.media as any)?.upload === 'function') {
          try {
            ctx.log.info(`[pixelseo] uploading via ctx.media: ${filename}`);
            const uploaded = await (ctx.media as any).upload(filename, mimeType, bytes) as { mediaId?: string; id?: string };
            mediaId = uploaded?.mediaId ?? uploaded?.id;
            ctx.log.info(`[pixelseo] ctx.media upload result: ${JSON.stringify(uploaded)}`);
          } catch (err) {
            ctx.log.warn(`[pixelseo] ctx.media upload failed: ${String(err)}`);
          }
        }

        // Fallback: Cloudflare Workers env (Astro v6 — locals.runtime.env removed)
        if (!mediaId) {
          const cfMedia = (cfWorkerEnv as any)?.MEDIA as
            | { put: (key: string, value: Uint8Array, opts?: object) => Promise<unknown> }
            | undefined;
          const cfDb = (cfWorkerEnv as any)?.DB as
            | { prepare: (sql: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown> } } }
            | undefined;

          if (cfMedia && cfDb) {
            try {
              // Convert PNG→WebP using Cloudflare Images binding (if available)
              // API: images.input(stream).transform({}).output({ format }).response()
              const cfImages = (cfWorkerEnv as any)?.IMAGES as
                | { input: (src: ReadableStream) => { transform: (opts: Record<string, unknown>) => { output: (opts: Record<string, unknown>) => Promise<{ response: () => Response }> } } }
                | undefined;
              if (cfImages && mimeType === 'image/png') {
                try {
                  const stream = new Response(bytes).body!;
                  const outputObj = await cfImages
                    .input(stream)
                    .transform({})
                    .output({ format: 'image/webp', quality: 80 });
                  const webpResponse = outputObj.response();
                  const webpBuffer = await webpResponse.arrayBuffer();
                  bytes = new Uint8Array(webpBuffer);
                  mimeType = 'image/webp';
                  ctx.log.info(`[pixelseo] converted PNG→WebP, bytes=${bytes.length}`);
                } catch (imgErr) {
                  ctx.log.warn(`[pixelseo] WebP conversion failed, storing PNG: ${String(imgErr)}`);
                }
              }

              // Derive extension from actual mimeType (Gemini always returns PNG
              // regardless of requested format, so filename may say .webp but bytes are PNG)
              const ext = (mimeType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
              const storageKey = `${crypto.randomUUID()}.${ext}`;

              // Fix filename extension to match actual bytes
              const basename = filename.replace(/\.[^.]+$/, '') + '.' + ext;

              await cfMedia.put(storageKey, bytes, { httpMetadata: { contentType: mimeType } });
              mediaId = crypto.randomUUID();
              await cfDb
                .prepare('INSERT INTO media (id, filename, mime_type, size, alt, storage_key) VALUES (?, ?, ?, ?, ?, ?)')
                .bind(mediaId, basename, mimeType, bytes.length, altText ?? null, storageKey)
                .run();
              ctx.log.info(`[pixelseo] direct env upload: mediaId=${mediaId}, key=${storageKey}`);
            } catch (err) {
              ctx.log.warn(`[pixelseo] direct env upload failed: ${String(err)}`);
              mediaId = undefined;
            }
          } else {
            ctx.log.warn('[pixelseo] no upload path available (ctx.media.upload unavailable, CF env MEDIA/DB missing)');
          }
        }
      }

      return {
        success:           true,
        media_id:          mediaId ?? null,
        image_url:         imageUrl,
        filename,
        credits_remaining: creditsRemaining,
        seo: { alt_text: altText, schema },
        _debug: {
          got_bytes:   bytes ? bytes.length : 0,
          mime_type:   mimeType,
          media_id_raw: mediaId ?? null,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // settings/save — store API key in KV
  // -------------------------------------------------------------------------
  'settings/save': {
    handler: async (
      routeCtx: { input: unknown },
      ctx: { kv: { set: (key: string, value: string) => Promise<void> } },
    ) => {
      const input = isRecord(routeCtx.input) ? routeCtx.input : {};
      const val   = str(input['pixelseo_api_key']);
      if (val?.trim()) await ctx.kv.set('settings:pixelseo_api_key', val.trim());
      return { success: true };
    },
  },

  // -------------------------------------------------------------------------
  // settings/load — return whether key is configured (never expose the key)
  // -------------------------------------------------------------------------
  'settings/load': {
    handler: async (
      _routeCtx: { input: unknown },
      ctx: { kv: { get: <T>(key: string) => Promise<T | null> } },
    ) => {
      const key = await ctx.kv.get<string>('settings:pixelseo_api_key');
      return { configured: !!key, pixelseo_api_key_set: !!key };
    },
  },

  // -------------------------------------------------------------------------
  // status — dashboard widget
  // -------------------------------------------------------------------------
  status: {
    handler: async (
      _routeCtx: { input: unknown },
      ctx: { kv: { get: <T>(key: string) => Promise<T | null> } },
    ) => {
      const key = await ctx.kv.get<string>('settings:pixelseo_api_key');
      return { configured: !!key };
    },
  },
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export const hooks = {
  'plugin:install': {
    handler: async (
      _event: unknown,
      ctx: { log: { info: (msg: string) => void } },
    ) => {
      ctx.log.info('PixelSEO plugin installed');
    },
  },
};

// ─── Native-format entry point ────────────────────────────────────────────────
// emdash calls createPlugin() and expects a ResolvedPlugin-compatible object.
// Native routes receive a single `ctx` argument where ctx.input holds the
// request body.  The existing handlers were written with the standard-sandbox
// two-arg signature (routeCtx, ctx).  Passing `ctx` for both args works because
// RouteContext extends PluginContext and already carries `.input`.

export function createPlugin(_options: Record<string, unknown> = {}) {
  return definePlugin({
    id:           'pixelseo',
    version:      '1.0.0',
    capabilities: ['network:fetch', 'write:media'],
    allowedHosts: ['pixelseo.ai', 'images.pixelseo.ai'],
    hooks,
    routes: {
      generate:          { handler: (ctx: any) => routes.generate.handler(ctx, ctx) },
      'settings/save':   { handler: (ctx: any) => routes['settings/save'].handler(ctx, ctx) },
      'settings/load':   { handler: (ctx: any) => routes['settings/load'].handler(ctx, ctx) },
      status:            { handler: (ctx: any) => routes.status.handler(ctx, ctx) },
    },
    admin: {
      pages:   [{ path: '/settings', label: 'PixelSEO', icon: 'image' }],
      widgets: [{ id: 'status', title: 'PixelSEO', size: 'third' }],
    },
  } as any);
}
