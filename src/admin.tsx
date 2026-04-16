/**
 * PixelSEO Plugin — Admin UI
 *
 * Exports:
 *   widgets.status     — dashboard widget showing configured / not configured
 *   pages['/settings'] — settings page for entering the pixelseo.ai API key
 *                        and running a test generation
 */

import {
  Image,
  CheckCircle,
  WarningCircle,
  FloppyDisk,
  CircleNotch,
  Sparkle,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import type { PluginAdminExports } from 'emdash';
import { apiFetch, parseApiResponse } from 'emdash/plugin-utils';
import * as React from 'react';

const API_BASE = '/_emdash/api/plugins/pixelseo';

// =============================================================================
// Dashboard Widget
// =============================================================================

interface StatusData {
  configured: boolean;
}

function StatusWidget() {
  const [status, setStatus] = React.useState<StatusData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await apiFetch(`${API_BASE}/status`);
        if (res.ok) {
          setStatus(await parseApiResponse<StatusData>(res));
        }
      } catch {
        // Non-critical
      } finally {
        setIsLoading(false);
      }
    }
    void fetchStatus();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <CircleNotch className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const configured = status?.configured ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${configured ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'}`}>
          <Image className={`h-5 w-5 ${configured ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
        </div>
        <div>
          <div className="font-medium">PixelSEO</div>
          <div className="text-xs text-muted-foreground">
            {configured ? 'Ready to generate' : 'API key required'}
          </div>
        </div>
      </div>

      <div className="pt-2">
        <a
          href="/_emdash/admin/plugins/pixelseo/settings"
          className="text-xs text-primary hover:underline"
        >
          {configured ? 'Configure' : 'Set up API key →'}
        </a>
      </div>
    </div>
  );
}

// =============================================================================
// Settings Page
// =============================================================================

interface SettingsData {
  configured:           boolean;
  pixelseo_api_key_set: boolean;
}

interface GenerateResult {
  success:           boolean;
  error?:            string;
  media_id?:         string | null;
  filename?:         string;
  credits_remaining?: number | null;
  seo?: {
    alt_text: string;
    schema:   Record<string, unknown>;
  };
}

function SettingsPage() {
  const [current, setCurrent]     = React.useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving]   = React.useState(false);
  const [message, setMessage]     = React.useState<{ text: string; ok: boolean } | null>(null);

  // Form state — blank means "don't overwrite existing value"
  const [apiKey, setApiKey] = React.useState('');

  // Generate panel
  const [genPrompt,      setGenPrompt]      = React.useState('');
  const [genOrientation, setGenOrientation] = React.useState('landscape');
  const [genFormat,      setGenFormat]      = React.useState('webp');
  const [isGenerating,   setIsGenerating]   = React.useState(false);
  const [genResult,      setGenResult]      = React.useState<GenerateResult | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`${API_BASE}/settings/load`);
        if (res.ok) {
          const data = await parseApiResponse<SettingsData>(res);
          setCurrent(data);
        }
      } catch {
        // Use empty defaults
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const body: Record<string, string> = {};
      if (apiKey.trim()) body['pixelseo_api_key'] = apiKey.trim();

      const res = await apiFetch(`${API_BASE}/settings/save`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (res.ok) {
        setMessage({ text: 'API key saved', ok: true });
        setApiKey('');
        const reload = await apiFetch(`${API_BASE}/settings/load`);
        if (reload.ok) setCurrent(await parseApiResponse<SettingsData>(reload));
      } else {
        setMessage({ text: 'Failed to save key', ok: false });
      }
    } catch {
      setMessage({ text: 'Failed to save key', ok: false });
    } finally {
      setIsSaving(false);
      // eslint-disable-next-line e18e/prefer-timer-args -- conflicts with no-implied-eval
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setIsGenerating(true);
    setGenResult(null);
    try {
      const res = await apiFetch(`${API_BASE}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:      genPrompt.trim(),
          orientation: genOrientation,
          format:      genFormat,
        }),
      });
      setGenResult(await parseApiResponse<GenerateResult>(res));
    } catch {
      setGenResult({ success: false, error: 'Request failed' });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PixelSEO</h1>
          <p className="text-muted-foreground mt-1">
            AI image generation with SEO metadata — powered by pixelseo.ai
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-sm flex items-center gap-1 ${message.ok ? 'text-green-600' : 'text-red-600'}`}>
              {message.ok
                ? <CheckCircle className="h-4 w-4" />
                : <WarningCircle className="h-4 w-4" />}
              {message.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !apiKey.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving
              ? <CircleNotch className="h-4 w-4 animate-spin" />
              : <FloppyDisk className="h-4 w-4" />}
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Status banner */}
      {current && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${
          current.configured
            ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
            : 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
        }`}>
          {current.configured
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <WarningCircle className="h-4 w-4 shrink-0" />}
          {current.configured
            ? 'API key configured. Plugin is ready.'
            : 'Enter your pixelseo.ai API key below to get started.'}
        </div>
      )}

      {/* API Key */}
      <div className="border rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">API Key</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your key is stored encrypted in plugin KV storage and never exposed in source code.
            Leave blank to keep the existing value.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium flex items-center gap-2">
            pixelseo.ai API Key
            {current?.pixelseo_api_key_set && (
              <span className="text-xs text-green-600 font-normal flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> set
              </span>
            )}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
            placeholder={current?.pixelseo_api_key_set ? '••••••••••••••••••••' : 'px_live_…'}
            className="w-full px-3 py-2 border rounded-md bg-background text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Find your key in your{' '}
            <a
              href="https://pixelseo.ai/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              pixelseo.ai dashboard <ArrowSquareOut className="h-3 w-3" />
            </a>
            . Each image generation costs 1 credit.
          </p>
        </div>
      </div>

      {/* Test generation */}
      <div className="border rounded-lg p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkle className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Test Generation</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate a test image to confirm your key is working. Uses 1 credit.
        </p>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Prompt</label>
            <textarea
              value={genPrompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setGenPrompt(e.target.value)}
              rows={3}
              placeholder="A coastal landscape at golden hour, impressionist painting style"
              className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Orientation</label>
              <select
                value={genOrientation}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGenOrientation(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="landscape">Landscape (16:9)</option>
                <option value="portrait">Portrait (9:16)</option>
                <option value="square">Square (1:1)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Format</label>
              <select
                value={genFormat}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGenFormat(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="webp">WebP</option>
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !genPrompt.trim() || !current?.configured}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {isGenerating
              ? <CircleNotch className="h-4 w-4 animate-spin" />
              : <Sparkle className="h-4 w-4" />}
            {isGenerating ? 'Generating…' : 'Generate test image'}
          </button>

          {!current?.configured && (
            <p className="text-xs text-muted-foreground">Save your API key first to enable generation.</p>
          )}

          {/* Result */}
          {genResult && (
            <div className="p-4 bg-muted/50 rounded-md space-y-3 text-sm">
              {genResult.success ? (
                <>
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                    <CheckCircle className="h-4 w-4" />
                    Image generated and uploaded to media library
                  </div>
                  <div className="space-y-1.5 text-muted-foreground">
                    {genResult.filename && (
                      <p><span className="font-medium text-foreground">Filename:</span> {genResult.filename}</p>
                    )}
                    {genResult.seo?.alt_text && (
                      <p><span className="font-medium text-foreground">Alt text:</span> {genResult.seo.alt_text}</p>
                    )}
                    {genResult.media_id && (
                      <p><span className="font-medium text-foreground">Media ID:</span> {genResult.media_id}</p>
                    )}
                    {genResult.credits_remaining != null && (
                      <p className="text-xs pt-1 border-t border-border">
                        Credits remaining: <span className="font-medium text-foreground">{genResult.credits_remaining}</span>
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <WarningCircle className="h-4 w-4" />
                  {genResult.error ?? 'Unknown error'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export const widgets: PluginAdminExports['widgets'] = {
  status: StatusWidget,
};

export const pages: PluginAdminExports['pages'] = {
  '/settings': SettingsPage,
};
