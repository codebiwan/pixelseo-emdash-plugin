# @pixelseo/emdash-plugin

An [EmDash CMS](https://emdash.dev) plugin that generates AI-powered, SEO-optimised images via [pixelseo.ai](https://pixelseo.ai) and uploads them directly to your media library.

## Features

- Generate images from a text prompt inside the EmDash admin dashboard
- Images are stored as WebP (converted server-side via Cloudflare Images) for optimal performance
- AI-generated alt text and schema metadata included automatically
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

Once configured, use the **Test Generation** panel in the PixelSEO settings page to generate images, or call the generate route from your own admin UI code:

```ts
POST /_emdash/api/plugins/pixelseo/generate
{
  "prompt": "A coastal landscape at golden hour, impressionist painting style",
  "orientation": "landscape",  // "landscape" | "portrait" | "square"
  "format": "webp"             // "webp" | "jpeg" | "png"
}
```

The response includes the `media_id` of the uploaded image, its filename, alt text, and schema metadata.

## License

MIT
