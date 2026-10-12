/**
 * chrome-ai.ts — thin, typed wrappers around Chrome's built-in on-device AI.
 *
 * Chrome ships Gemini Nano via two experimental globals:
 *   - `LanguageModel`  — general-purpose prompt/streaming (Prompt API)
 *   - `Summarizer`     — high-level summarisation (Summarizer API)
 *
 * Neither API is in TypeScript's lib types. We declare minimal `declare global`
 * interfaces here and nowhere else. All consuming features import only from
 * this module so the declarations stay in one place.
 *
 * Availability lifecycle: `'available'` → ready to use immediately.
 *   `'downloadable'` → call `create()` with a `monitor` to download + use.
 *   `'downloading'`  → another context already triggered download; use monitor.
 *   `'unavailable'`  → feature not supported in this Chrome build.
 *
 * @see https://developer.chrome.com/docs/ai/built-in
 */

// ---------------------------------------------------------------------------
// Global type declarations (minimal — only the surface we actually call)
// ---------------------------------------------------------------------------

/** Availability status returned by Chrome built-in AI capability checks. */
export type AIAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** A single message in a conversation seed for LanguageModel. */
export interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Progress event fired by the download monitor. */
export interface AIDownloadProgressEvent extends Event {
  /**
   * Progress as a 0–1 fraction in some Chrome builds, or bytes-loaded in
   * others. The helper `createSummarizer` / `createPromptSession` normalize
   * this to a 0–1 fraction for callers.
   */
  loaded: number;
  /** Total bytes (may be absent in builds that report `loaded` as a fraction). */
  total?: number;
}

/** Monitor object passed to `create()` for download-progress reporting. */
export type AIMonitor = EventTarget & {
  addEventListener(
    type: 'downloadprogress',
    listener: (ev: AIDownloadProgressEvent) => void,
  ): void;
};

/** Options accepted by `LanguageModel.create()`. */
export interface LanguageModelCreateOptions {
  /** Conversation seed — system/user/assistant turns loaded before first prompt. */
  initialPrompts?: LanguageModelMessage[];
  /** Called with a monitor object so callers can report download progress. */
  monitor?: (m: AIMonitor) => void;
}

/** A live LanguageModel session. */
export interface LanguageModelSession {
  /** One-shot prompt, returns the full response as a string. */
  prompt(text: string): Promise<string>;
  /**
   * Streaming prompt. Returns an async-iterable of string chunks.
   * NOTE: Chrome ≤128 yields cumulative text; ≥129 yields deltas. We handle
   * both in `streamingToFull` by always using the latest yielded value
   * as the running total (cumulative) — this is safe for display but means
   * delta-mode users see the full text on every chunk, not just new chars.
   */
  promptStreaming(text: string): AsyncIterable<string>;
  /** Approximate total token budget for this session. */
  inputQuota?: number;
  /** Measures tokens for a given string (may not be implemented in all builds). */
  measureInputUsage?(text: string): Promise<number>;
  /** Release model resources. Must be called on teardown. */
  destroy(): void;
}

/** Options for `Summarizer.create()`. */
export interface SummarizerCreateOptions {
  type?: 'tldr' | 'key-points' | 'teaser' | 'headline';
  format?: 'markdown' | 'plain-text';
  length?: 'short' | 'medium' | 'long';
  monitor?: (m: AIMonitor) => void;
}

/** A live Summarizer instance. */
export interface SummarizerInstance {
  summarize(text: string): Promise<string>;
  /** Release model resources. Must be called on teardown. */
  destroy(): void;
}

declare global {
  /**
   * Chrome built-in Prompt API (Gemini Nano).
   * Only present in Chrome with the appropriate flag/origin trial enabled.
   */
  const LanguageModel: {
    availability(): Promise<AIAvailability>;
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  };

  /**
   * Chrome built-in Summarizer API (Gemini Nano).
   * Only present in Chrome with the appropriate flag/origin trial enabled.
   */
  const Summarizer: {
    availability(): Promise<AIAvailability>;
    create(options?: SummarizerCreateOptions): Promise<SummarizerInstance>;
  };
}

// ---------------------------------------------------------------------------
// Availability helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current availability of the LanguageModel (Prompt API).
 * Returns `'unavailable'` if the global is not present at all.
 */
export async function isPromptAvailable(): Promise<AIAvailability> {
  if (!('LanguageModel' in self)) return 'unavailable';
  try {
    return await LanguageModel.availability();
  } catch {
    return 'unavailable';
  }
}

/**
 * Returns the current availability of the Summarizer API.
 * Returns `'unavailable'` if the global is not present at all.
 */
export async function isSummarizerAvailable(): Promise<AIAvailability> {
  if (!('Summarizer' in self)) return 'unavailable';
  try {
    return await Summarizer.availability();
  } catch {
    return 'unavailable';
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a Summarizer instance. Pass `onProgress` to receive download
 * progress (0–1) while the model is being fetched.
 *
 * Throws if the Summarizer global is absent or unavailable.
 */
export async function createSummarizer(
  opts: SummarizerCreateOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<SummarizerInstance> {
  if (!('Summarizer' in self)) {
    throw new Error('Summarizer API not available in this Chrome build.');
  }
  const options: SummarizerCreateOptions = { ...opts };
  if (onProgress) {
    options.monitor = (m) => {
      m.addEventListener('downloadprogress', (e) => {
        const frac = e.total != null && e.total > 0 ? e.loaded / e.total : e.loaded;
        onProgress(Math.min(1, Math.max(0, frac)));
      });
    };
  }
  return Summarizer.create(options);
}

/**
 * Create a LanguageModel session. Optionally seed with `initialPrompts`
 * (e.g. a system message containing the transcript) and receive download
 * progress via `onProgress`.
 *
 * Throws if the LanguageModel global is absent or unavailable.
 */
export async function createPromptSession(
  opts: LanguageModelCreateOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<LanguageModelSession> {
  if (!('LanguageModel' in self)) {
    throw new Error('LanguageModel API not available in this Chrome build.');
  }
  const options: LanguageModelCreateOptions = { ...opts };
  if (onProgress) {
    options.monitor = (m) => {
      m.addEventListener('downloadprogress', (e) => {
        const frac = e.total != null && e.total > 0 ? e.loaded / e.total : e.loaded;
        onProgress(Math.min(1, Math.max(0, frac)));
      });
    };
  }
  return LanguageModel.create(options);
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/**
 * One-shot summarisation: creates a Summarizer, summarizes `text`,
 * destroys the instance, and returns the result string.
 *
 * Use when you only need one summary and don't need to reuse the instance.
 */
export async function summarizeText(
  text: string,
  opts: SummarizerCreateOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const s = await createSummarizer(opts, onProgress);
  try {
    return await s.summarize(text);
  } finally {
    s.destroy();
  }
}

/**
 * One-shot prompt: creates a LanguageModel session, prompts once,
 * destroys the session, and returns the response string.
 */
export async function promptOnce(
  text: string,
  opts: LanguageModelCreateOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const session = await createPromptSession(opts, onProgress);
  try {
    return await session.prompt(text);
  } finally {
    session.destroy();
  }
}

// ---------------------------------------------------------------------------
// Transcript chunking
// ---------------------------------------------------------------------------

/**
 * Maximum characters per chunk sent to the model. Conservative to stay
 * comfortably within Gemini Nano's ~6k-token context window.
 * At ~4 chars/token this is ~3 000 tokens, leaving room for the prompt wrapper.
 */
const MAX_CHUNK_CHARS = 12_000;

/**
 * Split a long transcript string into chunks of at most `MAX_CHUNK_CHARS`
 * characters, breaking only on newline boundaries so segments stay intact.
 *
 * When the transcript fits in one chunk, returns a single-element array.
 */
export function chunkTranscript(transcript: string): string[] {
  if (transcript.length <= MAX_CHUNK_CHARS) return [transcript];

  const lines = transcript.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    // +1 for the newline we'll re-join with.
    if (current.length + line.length + 1 > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trimEnd());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim().length > 0) chunks.push(current.trimEnd());
  return chunks;
}

/**
 * Format an array of transcript segments into a plain-text block suitable
 * for an AI prompt. Each line is `[mm:ss] spoken text`.
 *
 * @param segments - TranscriptSegment-compatible objects (start + text).
 * @param withTimestamps - include `[mm:ss]` prefixes (default: true).
 */
export function formatTranscriptForAI(
  segments: Array<{ start: number; text: string }>,
  withTimestamps = true,
): string {
  return segments
    .map((s) => {
      if (!withTimestamps) return s.text;
      const m = Math.floor(s.start / 60);
      const sec = Math.floor(s.start % 60);
      const ts = `${m}:${sec.toString().padStart(2, '0')}`;
      return `[${ts}] ${s.text}`;
    })
    .join('\n');
}

/**
 * Human-readable description of an unavailability status — shown in panel
 * "model not ready" states.
 */
export function availabilityMessage(status: AIAvailability): string {
  switch (status) {
    case 'downloadable':
      return 'On-device AI model needs to download. Click to begin.';
    case 'downloading':
      return 'On-device AI model is downloading… please wait.';
    case 'unavailable':
      return 'On-device AI not available. Enable Chrome built-in AI in chrome://flags.';
    default:
      return '';
  }
}
