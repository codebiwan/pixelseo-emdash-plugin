/**
 * Minimal type stubs for the `emdash` package.
 *
 * emdash is not yet published to npm. These stubs cover what this plugin
 * actually uses so TypeScript is satisfied. Replace with the real package
 * once it ships.
 */
declare module 'emdash' {
  // -------------------------------------------------------------------------
  // Plugin context — the `ctx` object passed to every route handler and hook
  // -------------------------------------------------------------------------
  export interface PluginContext {
    input: unknown;
    kv: {
      get<T>(key: string): Promise<T | null>;
      set(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<void>;
    };
    http?: {
      fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
    };
    media?: {
      getUploadUrl(filename: string, mimeType: string): Promise<{ uploadUrl: string; id: string }>;
    };
    content?: {
      update(collection: string, id: string, data: Record<string, unknown>): Promise<void>;
    };
    log: {
      info(message: string, ...args: unknown[]): void;
      warn(message: string, ...args: unknown[]): void;
      error(message: string, ...args: unknown[]): void;
    };
  }

  // -------------------------------------------------------------------------
  // Plugin definition types
  // -------------------------------------------------------------------------
  export interface PluginAdminPage {
    path: string;
    label: string;
    icon?: string;
  }

  export interface PluginAdminWidget {
    id: string;
    title: string;
    size?: 'third' | 'half' | 'full';
  }

  export interface PluginAdmin {
    entry: string;
    pages?: PluginAdminPage[];
    widgets?: PluginAdminWidget[];
  }

  export interface PluginRouteDefinition {
    handler(ctx: PluginContext): Promise<unknown>;
  }

  export interface PluginHookDefinition {
    handler(event: unknown, ctx: PluginContext): Promise<void>;
  }

  export interface ResolvedPluginDefinition {
    id: string;
    version: string;
    capabilities?: string[];
    allowedHosts?: string[];
    admin?: PluginAdmin;
    hooks?: Record<string, PluginHookDefinition>;
    routes?: Record<string, PluginRouteDefinition>;
  }

  export type ResolvedPlugin = ResolvedPluginDefinition;

  export function definePlugin(definition: ResolvedPluginDefinition): ResolvedPlugin;

  // -------------------------------------------------------------------------
  // Descriptor — what the host site imports in its config
  // -------------------------------------------------------------------------
  export interface PluginDescriptor<TOptions = Record<string, never>> {
    id: string;
    version: string;
    entrypoint: string;
    options?: TOptions;
    adminEntry?: string;
    adminPages?: PluginAdminPage[];
    adminWidgets?: PluginAdminWidget[];
  }

  // -------------------------------------------------------------------------
  // Admin UI exports
  // -------------------------------------------------------------------------
  export interface PluginAdminExports {
    widgets: Record<string, React.ComponentType>;
    pages: Record<string, React.ComponentType>;
  }
}

declare module 'emdash/plugin-utils' {
  export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  export function parseApiResponse<T>(res: Response, errorMessage?: string): Promise<T>;
}
