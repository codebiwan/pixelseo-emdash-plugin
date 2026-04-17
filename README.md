# @pixelseo/emdash-plugin

An [EmDash CMS](https://emdash.dev) plugin that generates AI-powered, SEO-optimised images via [pixelseo.ai](https://pixelseo.ai) and uploads them directly to your media library.

## Features

- Generate images from a text prompt inside the EmDash admin dashboard
- Images stored as WebP (converted server-side via Cloudflare Images) for optimal performance — typically 10x smaller than the source PNG
- AI-generated alt text stored automatically in the media library
- AI-generated SEO filename included with every image
- Supports landscape, portrait, and square orientations
- Credits remaining shown after each generation

## Requirements

- An EmDash site running on Cloudflare Workers (Astro + `@astrojs/cloudflare`)
- A [pixelseo.ai](https://pixelseo.ai) account with credits and an API key
- A Cloudflare `IMAGES` binding in your `wrangler.jsonc` (for WebP conversion)

## Getting started

### 1. Create a pixelseo.ai account

Sign up at [pixelseo.ai](https://pixelseo.ai).

### 2. Add credits

Visit [pixelseo.ai/pricing](https://pixelseo.ai/pricing) to purchase a credit pack. Each image generation costs 1 credit.

### 3. Create an API key

Generate an API key in your [pixelseo.ai dashboard](https://pixelseo.ai/dashboard).

## Installation

```bash
npm install @pixelseo/emdash-plugin
```

## Setup

Add the plugin to your EmDash site config:

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';
import { pixelseoPlugin } from '@pixelseo/emdash-plugin';

export default defineConfig({
  integrations: [
    emdash({
      plugins: [pixelseoPlugin()],
    }),
  ],
});
```

Then go to **Plugins → PixelSEO → Settings** in your EmDash admin, enter your pixelseo.ai API key, and save.

## Cloudflare IMAGES binding (required for WebP conversion)

Add the binding to your `wrangler.jsonc`:

```jsonc
{
  "images": {
    "binding": "IMAGES"
  }
}
```

Without this binding, images will still be generated and uploaded but stored as PNG instead of WebP.

## Usage

Once configured, use the **Test Generation** panel in the PixelSEO settings page to generate images. Each generated image is automatically:

- Converted to WebP at quality 80
- Named with an SEO-optimised descriptive filename
- Stored in your EmDash media library with alt text

You can also call the generate route directly from your own admin UI code:

```ts
POST /_emdash/api/plugins/pixelseo/generate
{
  "prompt": "A coastal landscape at golden hour, impressionist painting style",
  "orientation": "landscape",  // "landscape" | "portrait" | "square"
  "format": "webp"             // "webp" | "jpeg" | "png"
}
```

The response includes the `media_id` of the uploaded image, filename, alt text, schema metadata, and credits remaining.

## How it works

1. Your prompt is sent to the pixelseo.ai API
2. The API returns the image as base64, along with an SEO-optimised filename, alt text, and ImageObject schema
3. The plugin decodes the image and converts it from PNG to WebP using the Cloudflare `IMAGES` binding
4. The WebP image is uploaded to Cloudflare R2 via the `MEDIA` binding
5. A record is inserted into the EmDash D1 media table with filename, mime type, size, and alt text

## License

MIT
