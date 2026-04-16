/**
 * PixelSEO Plugin Descriptor
 *
 * Import this in your EmDash site config to register the plugin:
 *
 *   import { pixelseoPlugin } from '@pixelseo/emdash-plugin';
 *
 *   export default defineConfig({
 *     plugins: [pixelseoPlugin()],
 *   });
 */

import type { PluginDescriptor } from 'emdash';

export interface PixelSEOOptions {
  // Reserved for future configuration options
}

export function pixelseoPlugin(
  _options: PixelSEOOptions = {},
): PluginDescriptor<PixelSEOOptions> {
  return {
    id:         'pixelseo',
    version:    '0.2.0',
    entrypoint: '@pixelseo/emdash-plugin/plugin',
    options:    _options,
    adminEntry: '@pixelseo/emdash-plugin/admin',
    adminPages:   [{ path: '/settings', label: 'PixelSEO', icon: 'image' }],
    adminWidgets: [{ id: 'status', title: 'PixelSEO', size: 'third' }],
  };
}
