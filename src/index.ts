/**
 * PixelSEO — EmDash CMS Plugin
 *
 * Generates SEO-optimised images by calling the pixelseo.ai API.
 * Users only need one credential: their pixelseo.ai API key (px_live_…).
 *
 * Secret stored in plugin KV (entered once via the admin settings page):
 *   settings:pixelseo_api_key
 */

import type { ResolvedPlugin } from 'emdash';
import { definePlugin } from 'emdash';

const PIXELSEO_API = 'https://pixelseo.ai';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

async function getApiKey(kv: { get: <T>(key: string) => Promise<T | null> }): Promise<string> {
  const key = await kv.get<string>('settings:pixelseo_api_key');
  if (!key) {
    throw new Error('PixelSEO is not configured. Enter your pixelseo.ai API key in the plugin settings.');
  }
  return key;
}

export function createPlugin(): ResolvedPlugin {
  return definePlugin({
    id: 'pixelseo',
    version: '0.2.0',

    capabilities: ['write:media', 'write:content', 'network:fetch'],

    // Only two hosts needed — the API and the image CDN.
    allowedHosts: [
      'pixelseo.ai',
      'images.pixelseo.ai',
    ],

    admin: {
      entry:   '@pixelseo/emdash-plugin/admin',
      pages:   [{ path: '/settings', label: 'PixelSEO', icon: 'image' }],
      widgets: [{ id: 'status', title: 'PixelSEO', size: 'third' }],
    },

    hooks: {
      'plugin:install': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (_event: any, ctx: any) => {
          ctx.log.info('PixelSEO plugin installed');
        },
      },
    },

    routes: {
      // -----------------------------------------------------------------------
      // generate
      //
      // Calls POST /api/v1/generate on pixelseo.ai, fetches the returned image
      // from the CDN, uploads it to the emdash media library, and optionally
      // attaches it to a content record.
      //
      // Input:
      //   prompt      — full image prompt (required)
      //   orientation — landscape | portrait | square  (default: landscape)
      //   format      — webp | jpeg | png              (default: webp)
      //   collection  — content collection to update   (optional)
      //   content_id  — content record ID              (optional)
      // -----------------------------------------------------------------------
      generate: {
        handler: async (ctx) => {
          const input = isRecord(ctx.input) ? ctx.input : {};

          const prompt      = str(input['prompt']);
          const orientation = str(input['orientation']) ?? 'landscape';
          const format      = str(input['format'])      ?? 'webp';
          const collection  = str(input['collection'])  ?? null;
          const contentId   = str(input['content_id'])  ?? null;

          if (!prompt?.trim()) {
            return { success: false, error: 'prompt is required' };
          }
          if (!['landscape', 'portrait', 'square'].includes(orientation)) {
            return { success: false, error: 'orientation must be landscape, portrait, or square' };
          }
          if (!['webp', 'jpeg', 'png'].includes(format)) {
            return { success: false, error: 'format must be webp, jpeg, or png' };
          }

          let apiKey: string;
          try {
            apiKey = await getApiKey(ctx.kv);
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
          }

          const fetchFn = ctx.http?.fetch.bind(ctx.http) ?? globalThis.fetch;

          // 1. Generate image + SEO package via pixelseo.ai API
          let imageUrl: string;
          let filename: string;
          let altText: string;
          let schema: Record<string, unknown>;
          let creditsRemaining: number | null = null;

          try {
            const res = await fetchFn(`${PIXELSEO_API}/api/v1/generate`, {
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
              }),
            });

            if (!res.ok) {
              const body = await res.text();
              if (res.status === 402) {
                return { success: false, error: 'Insufficient credits. Purchase more at pixelseo.ai/pricing.' };
              }
              if (res.status === 401) {
                return { success: false, error: 'Invalid API key. Check your pixelseo.ai API key in settings.' };
              }
              return { success: false, error: `pixelseo.ai error ${res.status}: ${body}` };
            }

            const data = await res.json() as {
              image_url:        string;
              filename:         string;
              alt_text:         string;
              schema:           Record<string, unknown>;
              credits_remaining: number;
            };

            imageUrl         = data.image_url;
            filename         = data.filename;
            altText          = data.alt_text;
            schema           = data.schema;
            creditsRemaining = data.credits_remaining ?? null;
          } catch (err) {
            ctx.log.error('pixelseo.ai generate failed', err);
            return { success: false, error: 'Failed to reach pixelseo.ai. Check your connection and try again.' };
          }

          // 2. Fetch image bytes from CDN (images.pixelseo.ai)
          let bytes: Uint8Array;
          let mimeType: string;
          try {
            const imgRes = await fetchFn(imageUrl);
            if (!imgRes.ok) throw new Error(`CDN fetch returned ${imgRes.status}`);
            const buf = await imgRes.arrayBuffer();
            bytes    = new Uint8Array(buf);
            mimeType = imgRes.headers.get('content-type') ?? `image/${format === 'jpeg' ? 'jpeg' : format}`;
          } catch (err) {
            ctx.log.error('Image CDN fetch failed', err);
            return {
              success: false,
              error: 'Image was generated but could not be fetched from the CDN. Try again.',
            };
          }

          // 3. Upload to emdash media library via signed URL
          let mediaId: string | undefined;
          if (ctx.media?.getUploadUrl) {
            try {
              const { uploadUrl, id } = await ctx.media.getUploadUrl(filename, mimeType) as {
                uploadUrl: string;
                id: string;
              };
              await fetchFn(uploadUrl, {
                method:  'PUT',
                headers: { 'Content-Type': mimeType },
                body:    bytes,
              });
              mediaId = id;
            } catch (err) {
              ctx.log.error('Media upload failed', err);
              // Non-fatal — return SEO metadata even if upload fails
            }
          }

          // 4. Optionally attach to a content record
          if (collection && contentId && ctx.content?.update) {
            try {
              await ctx.content.update(collection, contentId, {
                ...(mediaId ? { featured_image: mediaId } : {}),
                seo_schema: schema,
                image_alt:  altText,
              });
            } catch (err) {
              ctx.log.warn('Failed to update content record', err);
            }
          }

          return {
            success:          true,
            media_id:         mediaId ?? null,
            filename,
            credits_remaining: creditsRemaining,
            seo: {
              alt_text: altText,
              schema,
            },
          };
        },
      },

      // -----------------------------------------------------------------------
      // settings/save — store API key in KV
      // -----------------------------------------------------------------------
      'settings/save': {
        handler: async (ctx) => {
          const input = isRecord(ctx.input) ? ctx.input : {};
          const val   = str(input['pixelseo_api_key']);
          if (val?.trim()) {
            await ctx.kv.set('settings:pixelseo_api_key', val.trim());
          }
          return { success: true };
        },
      },

      // -----------------------------------------------------------------------
      // settings/load — return current settings (key is redacted)
      // -----------------------------------------------------------------------
      'settings/load': {
        handler: async (ctx) => {
          const key = await ctx.kv.get<string>('settings:pixelseo_api_key');
          return {
            configured:           !!key,
            pixelseo_api_key_set: !!key,
          };
        },
      },

      // -----------------------------------------------------------------------
      // status — dashboard widget
      // -----------------------------------------------------------------------
      status: {
        handler: async (ctx) => {
          const key = await ctx.kv.get<string>('settings:pixelseo_api_key');
          return { configured: !!key };
        },
      },
    },
  });
}

export default createPlugin;
