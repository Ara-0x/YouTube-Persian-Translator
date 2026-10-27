/* ============================================================================
 * YouTube Persian Translator — Shared configuration
 * ----------------------------------------------------------------------------
 * این فایل در سرویس‌ورکر (importScripts)، اسکریپت محتوا، popup و options
 * بارگذاری می‌شود. فقط داده و توابع خالص دارد و هیچ API مرورگری صدا نمی‌زند.
 * ==========================================================================*/
(function initYptConfig() {
  "use strict";

  const LANGUAGES = [
    { code: "fa", label: "فارسی", rtl: true },
    { code: "en", label: "English", rtl: false },
    { code: "ar", label: "العربية", rtl: true },
    { code: "tr", label: "Türkçe", rtl: false },
    { code: "ru", label: "Русский", rtl: false },
    { code: "de", label: "Deutsch", rtl: false },
    { code: "fr", label: "Français", rtl: false },
    { code: "es", label: "Español", rtl: false },
  ];

  const GEMINI_VOICES = [
    { id: "Kore", label: "Kore — آرام و زنانه" },
    { id: "Puck", label: "Puck — پرانرژی" },
    { id: "Zephyr", label: "Zephyr — روشن" },
    { id: "Charon", label: "Charon — مردانه و سنگین" },
    { id: "Aoede", label: "Aoede — نرم" },
    { id: "Orus", label: "Orus — جدی" },
  ];
  const GEMINI_TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];

  const PROVIDERS = {
    google: {
      id: "google",
      label: "گوگل ترنسلیت",
      badge: "رایگان",
      needsKey: false,
      supportsDubbing: false,
      supportsContext: false,
      latency: "سریع",
      description: "بدون کلید و بدون ثبت‌نام. سریع‌ترین و پایدارترین گزینه.",
    },
  };

  const PROVIDER_ORDER = ["google"];

  const DEFAULTS = {
    version: 3,
    enabled: false,
    provider: "google",
    targetLang: "fa",
    mode: "translate", // translate | passthrough

    // ظاهر
    theme: "dark", // dark | light
    snapToCaptions: false,
    bilingual: true,
    hideNativeCaptions: true,
    position: "bottom", // bottom | top | custom
    overlayX: 50,
    overlayY: 82,
    fontSize: 22,
    opacity: 0.85,

    // سرعت
    showLatency: false,

    // دوبله
    dubbing: false,
    dubbingEngine: "browser", // browser | gemini
    geminiVoice: "Kore",

    // کیفیت / سرعت
    contextLines: 2,
    fallbackToGoogle: true,

    models: {
      geminiTts: "gemini-2.5-flash-preview-tts",
    },
    endpoints: {},
    apiKeys: {
      gemini: "",
    },
  };

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  /** ادغام عمیق؛ آرایه‌ها جایگزین می‌شوند. */
  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    if (!isPlainObject(patch)) return out;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (isPlainObject(value) && isPlainObject(out[key])) {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function languageOf(code) {
    return LANGUAGES.find((item) => item.code === code) || LANGUAGES[0];
  }

  /** هر ورودی‌ای را به یک تنظیمات معتبر و کامل تبدیل می‌کند. */
  function normalizeSettings(raw) {
    const settings = deepMerge(DEFAULTS, raw || {});

    if (!PROVIDERS[settings.provider]) settings.provider = DEFAULTS.provider;
    if (settings.mode !== "passthrough") settings.mode = "translate";
    if (!LANGUAGES.some((item) => item.code === settings.targetLang)) {
      settings.targetLang = DEFAULTS.targetLang;
    }
    if (settings.position !== "top" && settings.position !== "custom") {
      settings.position = "bottom";
    }
    if (settings.dubbingEngine !== "gemini") settings.dubbingEngine = "browser";

    settings.fontSize = clamp(Number(settings.fontSize) || DEFAULTS.fontSize, 14, 40);
    settings.opacity = clamp(Number(settings.opacity) || DEFAULTS.opacity, 0.3, 1);
    settings.contextLines = clamp(Number(settings.contextLines) || 0, 0, 4);
    settings.overlayX = clamp(Number(settings.overlayX) || DEFAULTS.overlayX, 0, 100);
    settings.overlayY = clamp(Number(settings.overlayY) || DEFAULTS.overlayY, 0, 100);

    settings.enabled = Boolean(settings.enabled);
    settings.dubbing = Boolean(settings.dubbing);
    settings.bilingual = Boolean(settings.bilingual);
    settings.snapToCaptions = Boolean(settings.snapToCaptions);
    if (settings.theme !== "light") settings.theme = "dark";
    // حذف تنظیم قدیمی تم‌های متعدد (در نسخه‌های قبلی ذخیره می‌شد)
    delete settings.themePreset;
    settings.hideNativeCaptions = Boolean(settings.hideNativeCaptions);
    settings.fallbackToGoogle = Boolean(settings.fallbackToGoogle);
    settings.showLatency = Boolean(settings.showLatency);

    if (!settings.apiKeys || typeof settings.apiKeys !== "object") {
      settings.apiKeys = { ...DEFAULTS.apiKeys };
    }
    for (const name of Object.keys(DEFAULTS.apiKeys)) {
      const value = settings.apiKeys[name];
      settings.apiKeys[name] = typeof value === "string" ? value.trim() : "";
    }

    if (!settings.models || typeof settings.models !== "object") {
      settings.models = { ...DEFAULTS.models };
    }
    for (const [name, fallback] of Object.entries(DEFAULTS.models)) {
      if (!settings.models[name] || typeof settings.models[name] !== "string") {
        settings.models[name] = fallback;
      }
    }

    if (!settings.endpoints || typeof settings.endpoints !== "object") {
      settings.endpoints = { ...DEFAULTS.endpoints };
    }

    return settings;
  }

  /** بررسی سریع اینکه provider فعال کلید لازم دارد یا خیر. */
  function providerReady(settings) {
    const meta = PROVIDERS[settings.provider];
    if (!meta) return false;
    if (!meta.needsKey) return true;
    return Boolean((settings.apiKeys?.[settings.provider] || "").trim());
  }

  globalThis.YPT = {
    LANGUAGES,
    GEMINI_VOICES,
    GEMINI_TTS_MODELS,
    PROVIDERS,
    PROVIDER_ORDER,
    DEFAULTS,
    deepMerge,
    normalizeSettings,
    providerReady,
    languageOf,
  };
})();
