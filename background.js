/* ============================================================================
 * YouTube Persian Translator — Background service worker
 * ----------------------------------------------------------------------------
 * مسئولیت‌ها:
 *   • نگه‌داری تنظیمات و مهاجرت از نسخهٔ ۱
 *   • ترجمه با گوگل ترنسلیت (تنها provider فعال)
 *   • کش دو لایه (حافظه + chrome.storage.session) و dedupe درخواست‌ها
 *   • retry هوشمند و timeout
 *   • دوبلهٔ صوتی با Gemini TTS
 * ==========================================================================*/

importScripts("providers.js");

const { PROVIDERS, normalizeSettings, deepMerge } = self.YPT;

const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 250;
const CACHE_MAX = 800;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const CACHE_STORE_KEY = "yptTranslateCache";
const AUDIO_CACHE_MAX = 8;
const networkStats = { ewma: 1200, failures: 0, circuitOpenUntil: 0 };
const YOUTUBE_URL = "https://www.youtube.com/*";

const LANG_NAMES = {
  fa: "Persian (Farsi)",
  en: "English",
  ar: "Arabic",
  tr: "Turkish",
  ru: "Russian",
  de: "German",
  fr: "French",
  es: "Spanish",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

class ProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = options.status || 0;
    this.retryable = Boolean(options.retryable);
    this.code = options.code || "";
  }
}

function persianizeError(message) {
  const m = String(message || "");
  if (/failed to fetch|networkerror|network error/i.test(m)) return "اتصال به اینترنت برقرار نشد.";
  if (/extension context invalidated/i.test(m)) return "افزونه بارگذاری مجدد شد. صفحه را رفرش کنید.";
  if (/timeout|timed out/i.test(m)) return "مهلت درخواست تمام شد.";
  return m;
}

/* ==========================================================================
 * Settings
 * ========================================================================*/

let settingsPromise = null;

async function loadSettings() {
  const stored = await chrome.storage.local.get(null);

  if (stored.settings && typeof stored.settings === "object") {
    return normalizeSettings(stored.settings);
  }

  // مهاجرت از نسخهٔ ۱ (کلیدهای پراکنده)
  const legacy = {};
  if (stored.provider || stored.translationProvider) {
    legacy.provider = stored.provider || stored.translationProvider;
  }
  if (typeof stored.enabled === "boolean") legacy.enabled = stored.enabled;
  if (typeof stored.dubbing === "boolean") legacy.dubbing = stored.dubbing;
  if (stored.translationMode === "youtube") legacy.mode = "passthrough";
  if (stored.apiKeys && typeof stored.apiKeys === "object") legacy.apiKeys = stored.apiKeys;

  const migrated = normalizeSettings(legacy);
  await chrome.storage.local.set({ settings: migrated });
  return migrated;
}

function getSettings() {
  if (!settingsPromise) settingsPromise = loadSettings();
  return settingsPromise;
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings(deepMerge(current, patch));
  await chrome.storage.local.set({ settings: next });
  settingsPromise = Promise.resolve(next);
  return next;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) {
    settingsPromise = Promise.resolve(normalizeSettings(changes.settings.newValue));
    void refreshBadge();
  }
});

async function refreshBadge() {
  try {
    const settings = await getSettings();
    const on = settings.enabled;
    await chrome.action.setBadgeText({ text: on ? "فا" : "" });
    if (on) await chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  } catch {
    /* badge ممکن است در حالت‌های خاص در دسترس نباشد */
  }
}

/* ==========================================================================
 * Translation cache (memory + session storage)
 * ========================================================================*/

const memoryCache = new Map(); // key -> { value, at }
let cacheHydrated = false;
let persistTimer = null;

async function hydrateCache() {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const stored = await chrome.storage.session.get(CACHE_STORE_KEY);
    const entries = stored?.[CACHE_STORE_KEY];
    if (!Array.isArray(entries)) return;
    const now = Date.now();
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 3) continue;
      const [key, value, at] = entry;
      if (typeof key !== "string" || typeof value !== "string") continue;
      if (now - Number(at) > CACHE_TTL_MS) continue;
      memoryCache.set(key, { value, at: Number(at) });
    }
  } catch {
    /* session storage در دسترس نیست — فقط کش حافظه */
  }
}

function cacheGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    // expired: keep for stale fallback (do not delete)
    return null;
  }
  // LRU: تازه‌سازی ترتیب
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry.value;
}

function cacheGetStale(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  return entry.value;
}

function cacheSet(key, value) {
  memoryCache.delete(key);
  memoryCache.set(key, { value, at: Date.now() });
  while (memoryCache.size > CACHE_MAX) {
    memoryCache.delete(memoryCache.keys().next().value);
  }
  schedulePersist();
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistCache();
  }, 3000);
}

async function persistCache() {
  try {
    const now = Date.now();
    const entries = [];
    for (const [key, entry] of memoryCache) {
      if (now - entry.at <= CACHE_TTL_MS) entries.push([key, entry.value, entry.at]);
    }
    await chrome.storage.session.set({ [CACHE_STORE_KEY]: entries });
  } catch {
    /* نادیده بگیر: کش فقط برای سرعت است */
  }
}

async function clearCache() {
  memoryCache.clear();
  persistTimer && clearTimeout(persistTimer);
  persistTimer = null;
  try {
    await chrome.storage.session.remove(CACHE_STORE_KEY);
  } catch {
    /* نادیده بگیر */
  }
  // به تب‌های یوتیوب اطلاع بده تا کش محلی صفحه هم پاک شود
  try {
    const tabs = await chrome.tabs.query({ url: YOUTUBE_URL });
    await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: "cacheCleared" })));
  } catch {
    /* نادیده بگیر */
  }
}

/* ==========================================================================
 * HTTP helpers
 * ========================================================================*/

function extractApiError(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.error === "string") return data.error;
  if (data.error?.message) return data.error.message;
  if (data.message) return data.message;
  if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  return "";
}

/**
 * درخواست JSON با timeout و retry برای خطاهای موقت.
 * خطاهای 4xx (غیر از 429) بلافاصله پرتاب می‌شوند.
 */
async function fetchJson(url, options = {}, meta = {}) {
  const providerName = meta.providerLabel || "سرویس";
  const external = meta.signal || null;
  const timeoutMs = meta.timeout || TIMEOUT_MS;
  let lastError = null;

  if (external?.aborted) {
    throw new ProviderError("درخواست لغو شد.", { code: "aborted" });
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (external?.aborted) {
      throw new ProviderError("درخواست لغو شد.", { code: "aborted" });
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    external?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // keepalive عمداً تنظیم نشده تا مرورگر بتواند اتصال TLS/HTTP2 را
      // بین خطوط زیرنویس دوباره استفاده کند (تأخیر کمتر برای خط بعدی).
      const response = await fetch(url, { ...options, signal: controller.signal });
      const raw = await response.text();
      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { raw };
        }
      }

      if (response.ok) return data || {};

      const detail = extractApiError(data);
      const status = response.status;

      if (status === 401 || status === 403) {
        throw new ProviderError(`کلید ${providerName} نامعتبر است یا دسترسی ندارد.`, {
          status,
          code: "auth",
          retryable: false,
        });
      }
      if (status === 429) {
        throw new ProviderError(`سهمیهٔ ${providerName} تمام شده است. کمی بعد امتحان کنید.`, {
          status,
          code: "quota",
          retryable: true,
        });
      }

      const retryable = status >= 500 || status === 408 || status === 425;
      throw new ProviderError(persianizeError(detail || `${providerName}: خطای HTTP ${status}`), {
        status,
        code: "http",
        retryable,
      });
    } catch (error) {
      if (external?.aborted) {
        throw new ProviderError("درخواست لغو شد.", { code: "aborted" });
      }

      const normalized =
        error instanceof ProviderError
          ? error
          : error?.name === "AbortError"
            ? new ProviderError(`${providerName} در ${Math.round(timeoutMs / 1000)} ثانیه پاسخ نداد.`, {
                code: "timeout",
                retryable: true,
              })
            : new ProviderError(`اتصال به ${providerName} برقرار نشد. اتصال اینترنت را بررسی کنید.`, {
                code: "network",
                retryable: true,
              });

      lastError = normalized;
      const canRetry = normalized.retryable && attempt < MAX_ATTEMPTS - 1;
      if (!canRetry) throw normalized;
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    }

    await sleep(RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 200));
  }

  throw lastError || new ProviderError(`${providerName}: درخواست ناموفق بود.`);
}

/* ==========================================================================
 * Prompts
 * ========================================================================*/

function buildSystemPrompt(targetLang) {
  const languageName = LANG_NAMES[targetLang] || targetLang;
  const rules = [
    "You are a professional subtitle translator working on YouTube videos.",
    `Translate each subtitle line into ${languageName}.`,
    "Rules:",
    "- Output ONLY the translated subtitle text. No quotes, no labels, no explanations, no original text.",
    "- Keep it short and natural, like spoken language, readable in under three seconds.",
    "- Preserve names, numbers, brands and technical terms. Use the common spelling in the target language.",
    "- Never add information that is not present in the source.",
    "- The line may be an incomplete fragment because it is still being spoken. Translate only the words that are present; never complete or guess the rest.",
    "- If the line is a sound description such as [Music] or [Applause], translate it too.",
    "- Use correct punctuation and the native script of the target language.",
    "- Output exactly one line and never answer in English unless the target language is English.",
  ];
  if (targetLang === "fa") {
    rules.push("- Write in Persian script (فارسی). Latin words are acceptable only for names and technical terms.");
  }
  return rules.join("\n");
}

function buildUserPrompt(text, context) {
  const lines = Array.isArray(context) ? context.filter(Boolean).slice(-3) : [];
  if (!lines.length) {
    return `Translate this subtitle line:\n${text}`;
  }
  return [
    "Previous subtitle lines (context only, do not translate them):",
    ...lines.map((line) => `- ${line}`),
    "",
    "Subtitle line to translate:",
    text,
  ].join("\n");
}

/* ==========================================================================
 * Providers
 * ========================================================================*/

async function googleTranslate({ text, target, sourceLang, signal }) {
  const sl = sourceLang && /^[a-z]{2}(-[A-Z]{2})?$/.test(sourceLang) ? sourceLang : "auto";
  const normalizedText = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  const now = Date.now();
  if (networkStats.circuitOpenUntil > now) {
    throw new ProviderError("شبکه در دسترس نیست (مدار باز). کمی بعد امتحان کنید.", {
      code: "circuit-open",
      retryable: true,
    });
  }

  const timeout = Math.min(6000, Math.max(2500, Math.round(networkStats.ewma * 1.6)));
  const started = Date.now();

  const params = new URLSearchParams({
    client: "gtx",
    sl,
    tl: target,
    dt: "t",
    dj: "1",
    ie: "UTF-8",
    oe: "UTF-8",
    q: normalizedText,
  });

  try {
    const data = await fetchJson(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      { method: "GET" },
      { providerLabel: "گوگل ترنسلیت", signal, timeout },
    );

    const translation = (data?.sentences || [])
      .map((sentence) => sentence?.trans || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!translation) {
      throw new ProviderError("گوگل ترنسلیت پاسخی برنگرداند.", { code: "empty" });
    }

    const elapsed = Date.now() - started;
    networkStats.ewma = Math.round(networkStats.ewma * 0.7 + elapsed * 0.3);
    networkStats.failures = Math.max(0, networkStats.failures - 1);
    return translation;
  } catch (error) {
    if (error?.code !== "aborted") {
      networkStats.failures += 1;
      if (networkStats.failures >= 4) {
        networkStats.circuitOpenUntil = Date.now() + 15000;
      }
    }
    throw error;
  }
}

async function geminiSpeak({ text, key, model, voice }) {
  const prompt = `Read the following Persian sentence with a warm, natural, clear voice, suitable for a video voice-over. Do not add anything:\n\n${text}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Kore" } },
      },
    },
  };

  const data = await fetchJson(
    `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    },
    { providerLabel: "Gemini TTS" },
  );

  const inline = (data?.candidates?.[0]?.content?.parts || []).find((part) => part?.inlineData?.data)
    ?.inlineData;

  if (!inline?.data) {
    throw new ProviderError("Gemini صوتی تولید نکرد. مدل دوبله را در تنظیمات بررسی کنید.", {
      code: "empty",
    });
  }

  return {
    audio: inline.data,
    mimeType: inline.mimeType || "audio/L16;codec=pcm;rate=24000",
    model,
  };
}

/* ==========================================================================
 * Translation pipeline
 * ========================================================================*/

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function polishTranslation(text, targetLang) {
  let out = String(text || "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // حذف گیومه‌ها و برچسب‌های اضافی مدل
  out = out.replace(/^["'«»“”]+|["'«»“”]+$/g, "").trim();
  out = out.replace(/^(translation|ترجمه)\s*[:：]\s*/i, "").trim();

  if (targetLang === "fa") {
    out = out
      .replace(/(?<!\d)\s*,\s*(?!\d)/g, "، ")
      .replace(/\s*;\s*/g, "؛ ")
      .replace(/\s*\?\s*/g, "؟")
      .replace(/\s*!\s*/g, "!")
      .replace(/\s*،\s*/g, "، ");
  }

  return out.trim();
}

function expectsPersian(targetLang) {
  return targetLang === "fa";
}

async function runProvider(providerId, { text, target, context, settings, sourceLang, signal }) {
  const meta = PROVIDERS[providerId];
  if (!meta) throw new ProviderError(`مترجم «${providerId}» پشتیبانی نمی‌شود.`);

  if (meta.needsKey && !(settings.apiKeys?.[providerId] || "").trim()) {
    throw new ProviderError(`کلید ${meta.label} در تنظیمات وارد نشده است.`, { code: "no-key" });
  }

  switch (providerId) {
    case "google":
      return googleTranslate({ text, target, sourceLang, signal });
    default:
      throw new ProviderError(`مترجم «${providerId}» پشتیبانی نمی‌شود.`);
  }
}

const inFlight = new Map();
const activeTranslations = new Map();

async function handleTranslate(message, sender) {
  const settings = await getSettings();
  const text = cleanText(message.text);
  if (!text) throw new ProviderError("متن زیرنویس خالی است.", { code: "empty" });

  const providerId = PROVIDERS[message.provider] ? message.provider : settings.provider;
  const target = self.YPT.LANGUAGES.some((item) => item.code === message.target)
    ? message.target
    : settings.targetLang;
  const sourceLang = typeof message.sourceLang === "string" ? message.sourceLang : "";
  const context = Array.isArray(message.context)
    ? message.context.map(cleanText).filter(Boolean).slice(-3)
    : [];

  const cacheKey = `t|${providerId}|${target}|${text}`;
  await hydrateCache();

  const hit = cacheGet(cacheKey);
  if (hit) {
    return { translation: hit, provider: providerId, cached: true, ms: 0 };
  }

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  // هر تب یک «کانال» دارد؛ درخواست جدید، درخواست قبلی همان کانال را لغو می‌کند
  // تا پاسخ‌های کهنه نه وقت شبکه بگیرند نه سهمیهٔ سرویس را.
  const channel = `${sender?.tab?.id ?? "ext"}:${message.streamId || "default"}`;
  const previous = activeTranslations.get(channel);
  if (previous) previous.abort();

  const controller = new AbortController();
  activeTranslations.set(channel, controller);

  const started = Date.now();

  const task = (async () => {
    try {
      const raw = await runProvider(providerId, {
        text,
        target,
        context,
        settings,
        sourceLang,
        signal: controller.signal,
      });
      const translation = polishTranslation(raw, target);

      if (expectsPersian(target) && !/[\u0600-\u06FF]/.test(translation)) {
        throw new ProviderError(`${PROVIDERS[providerId].label} پاسخ فارسی برنگرداند.`, {
          code: "not-persian",
        });
      }

      cacheSet(cacheKey, translation);
      return { translation, provider: providerId, cached: false, ms: Date.now() - started };
    } catch (error) {
      if (error?.code === "aborted" || controller.signal.aborted) {
        throw new ProviderError("درخواست لغو شد.", { code: "aborted" });
      }

      const canFallback =
        settings.fallbackToGoogle && providerId !== "google" && error.code !== "no-key";

      if (!canFallback) {
        const stale = cacheGetStale(cacheKey);
        if (stale) {
          return { translation: stale, provider: providerId, cached: true, stale: true, ms: Date.now() - started };
        }
        throw error;
      }

      try {
        const raw = await googleTranslate({ text, target, sourceLang, signal: controller.signal });
        const translation = polishTranslation(raw, target);
        cacheSet(cacheKey, translation);
        return {
          translation,
          provider: "google",
          fallback: true,
          fallbackReason: error.message,
          ms: Date.now() - started,
        };
      } catch {
        const stale = cacheGetStale(cacheKey);
        if (stale) {
          return { translation: stale, provider: providerId, cached: true, stale: true, ms: Date.now() - started };
        }
        throw error;
      }
    }
  })().finally(() => {
    inFlight.delete(cacheKey);
    if (activeTranslations.get(channel) === controller) activeTranslations.delete(channel);
  });

  inFlight.set(cacheKey, task);
  return task;
}

/* ==========================================================================
 * Audio (dubbing)
 * ========================================================================*/

const audioCache = new Map();

async function handleSpeak(message) {
  const settings = await getSettings();
  const text = cleanText(message.text);
  if (!text) throw new ProviderError("متنی برای دوبله وجود ندارد.", { code: "empty" });

  if ((message.engine || settings.dubbingEngine) !== "gemini") {
    throw new ProviderError("دوبلهٔ Gemini غیرفعال است.", { code: "engine" });
  }

  const key = (settings.apiKeys.gemini || "").trim();
  if (!key) {
    throw new ProviderError("برای دوبلهٔ Gemini باید کلید API را در تنظیمات وارد کنید.", {
      code: "no-key",
    });
  }

  if (audioCache.has(text)) return audioCache.get(text);

  const result = await geminiSpeak({
    text,
    key,
    model: settings.models.geminiTts,
    voice: settings.geminiVoice,
  });

  audioCache.set(text, result);
  while (audioCache.size > AUDIO_CACHE_MAX) {
    audioCache.delete(audioCache.keys().next().value);
  }
  return result;
}

/* ==========================================================================
 * Status & diagnostics
 * ========================================================================*/

async function handleStatus() {
  const settings = await getSettings();
  const meta = PROVIDERS[settings.provider];
  const hasKey = !meta.needsKey || Boolean((settings.apiKeys?.[settings.provider] || "").trim());
  const geminiKey = Boolean((settings.apiKeys.gemini || "").trim());

  return {
    enabled: settings.enabled,
    provider: settings.provider,
    providerLabel: meta.label,
    ready: hasKey,
    needsKey: meta.needsKey,
    geminiKey,
    dubbingReady:
      settings.dubbingEngine === "browser" ? true : geminiKey && Boolean(settings.enabled),
    settings: {
      targetLang: settings.targetLang,
      mode: settings.mode,
      dubbing: settings.dubbing,
      dubbingEngine: settings.dubbingEngine,
    },
  };
}

async function handleTest(message) {
  const settings = await getSettings();
  const providerId = PROVIDERS[message.provider] ? message.provider : settings.provider;
  const started = Date.now();
  const raw = await runProvider(providerId, {
    text: "Hello, this is a test.",
    target: "fa",
    context: [],
    settings,
  });
  return {
    provider: providerId,
    translation: polishTranslation(raw, "fa"),
    ms: Date.now() - started,
  };
}

/**
 * فقط اجازهٔ تغییر موقعیت کارت شناور (از سمت اسکریپت محتوا).
 * عمداً محدود است تا هیچ پیامی نتواند تنظیمات حساس را بازنویسی کند.
 */
async function handlePatchSettings(message) {
  const allowed = ["overlayX", "overlayY", "position"];
  const patch = {};

  for (const key of allowed) {
    if (message?.patch && Object.prototype.hasOwnProperty.call(message.patch, key)) {
      patch[key] = message.patch[key];
    }
  }

  if (!Object.keys(patch).length) {
    throw new ProviderError("تنظیمی برای ذخیره وجود ندارد.", { code: "empty-patch" });
  }

  const next = await saveSettings(patch);
  return {
    overlayX: next.overlayX,
    overlayY: next.overlayY,
    position: next.position,
  };
}

/**
 * لغو ترجمهٔ در جریان برای یک کانال (تب/استریم). توسط اسکریپت محتوا
 * هنگام تغییر خط یا seek صدا زده می‌شود تا پاسخ‌های کهنه دور ریخته شوند.
 */
async function handleCancel(message, sender) {
  const channel = `${sender?.tab?.id ?? "ext"}:${message?.streamId || "default"}`;
  const controller = activeTranslations.get(channel);
  if (controller) {
    controller.abort();
    activeTranslations.delete(channel);
    return { cancelled: true, channel };
  }
  return { cancelled: false, channel };
}

/**
 * یک درخواست کوچک برای گرم‌کردن DNS/TLS/HTTP2 پیش از اولین زیرنویس.
 * نتیجه هم کش می‌شود تا اگر «ok» واقعاً در زیرنویس آمد، فوری باشد.
 */
async function handleWarmup(message) {
  const settings = await getSettings();
  const target = self.YPT.LANGUAGES.some((item) => item.code === message?.target)
    ? message.target
    : settings.targetLang;
  const key = `t|google|${target}|ok`;

  await hydrateCache();
  if (cacheGet(key)) return { warmed: true, cached: true };

  try {
    const raw = await googleTranslate({ text: "ok", target, signal: null });
    const translation = polishTranslation(raw, target);
    if (translation) cacheSet(key, translation);
    return { warmed: Boolean(translation) };
  } catch {
    // گرم‌کردن هرگز نباید خطای کاربر را نشان دهد؛ اولین ترجمهٔ واقعی تلاش می‌کند
    return { warmed: false };
  }
}

/* ==========================================================================
 * Message router
 * ========================================================================*/

const HANDLERS = {
  translate: handleTranslate,
  speak: handleSpeak,
  getStatus: handleStatus,
  testProvider: handleTest,
  patchSettings: handlePatchSettings,
  cancel: handleCancel,
  warmup: handleWarmup,
  ping: async () => ({ pong: true, at: Date.now() }),
  clearCache: async () => {
    await clearCache();
    return { cleared: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;
  const handler = HANDLERS[message.type];
  if (!handler) return false;

  Promise.resolve(handler(message, sender))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "خطای نامشخص",
        code: error?.code || "",
      });
    });

  return true;
});

/* ==========================================================================
 * Commands, lifecycle
 * ========================================================================*/

chrome.commands.onCommand.addListener(async (command) => {
  const settings = await getSettings();

  if (command === "toggle-translation") {
    await saveSettings({ enabled: !settings.enabled });
    return;
  }

  if (command === "toggle-dubbing") {
    const next = !settings.dubbing;
    await saveSettings({
      dubbing: next,
      enabled: next ? true : settings.enabled,
      // اگر کلید Gemini نداریم، دوبلهٔ مرورگر انتخاب شود
      dubbingEngine:
        next && settings.dubbingEngine === "gemini" && !settings.apiKeys.gemini
          ? "browser"
          : settings.dubbingEngine,
    });
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await getSettings();
  await chrome.storage.local.set({ settings });

  if (details.reason === "install") {
    try {
      await chrome.runtime.openOptionsPage();
    } catch {
      /* نادیده بگیر */
    }
  }

  void refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshBadge();
});

void refreshBadge();
void hydrateCache();
