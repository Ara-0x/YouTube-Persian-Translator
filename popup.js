/* ============================================================================
 * YouTube Persian Translator — Popup
 * ==========================================================================*/

(() => {
  "use strict";

  const api = globalThis.YPT;
  const $ = (id) => document.getElementById(id);

  let settings = api.normalizeSettings(null);
  let toastTimer = 0;

  /* ------------------------------------------------------------- options */

  function buildSelects() {
    const providerSelect = $("provider");
    for (const id of api.PROVIDER_ORDER) {
      const meta = api.PROVIDERS[id];
      if (!meta) continue;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = meta.needsKey ? meta.label : `${meta.label} · بدون کلید`;
      providerSelect.append(option);
    }

    const langSelect = $("targetLang");
    for (const lang of api.LANGUAGES) {
      const option = document.createElement("option");
      option.value = lang.code;
      option.textContent = lang.label;
      langSelect.append(option);
    }
  }

  /* --------------------------------------------------------------- state */

  function applyTheme(theme) {
    const mode = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = mode;
    const btn = $("themeToggle");
    if (btn) {
      btn.textContent = mode === "dark" ? "☀️" : "🌙";
      btn.title = mode === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تاریک";
      btn.setAttribute("aria-label", btn.title);
      btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
    }
  }
  function hasKey(provider) {
    const meta = api.PROVIDERS[provider];
    if (!meta.needsKey) return true;
    return Boolean((settings.apiKeys?.[provider] || "").trim());
  }

  function render() {
    applyTheme(settings.theme);
    $("enabled").checked = settings.enabled;
    $("provider").value = settings.provider;
    $("targetLang").value = settings.targetLang;
    $("dubbing").checked = settings.dubbing;
    $("dubbingEngine").value = settings.dubbingEngine;
    $("bilingual").checked = settings.bilingual;

    const geminiKey = Boolean((settings.apiKeys?.gemini || "").trim());
    const geminiOption = $("dubbingEngine").querySelector('option[value="gemini"]');
    if (geminiOption) {
      geminiOption.disabled = !geminiKey;
      geminiOption.textContent = geminiKey ? "Gemini (کیفیت بالا)" : "Gemini (نیازمند کلید)";
    }
    $("engine-row").style.display = settings.dubbing ? "" : "none";

    const ready = hasKey(settings.provider);
    const meta = api.PROVIDERS[settings.provider] || api.PROVIDERS.google;

    if (!meta) {
      const pl = $("provider-line");
      if (pl) pl.textContent = "مترجم یافت نشد.";
      return;
    }

    $("provider-line").textContent = ready
      ? `${meta.label} · آماده`
      : `${meta.label} · کلید لازم است`;
    $("provider-line").title = ready ? meta.description : `کلید ${meta.label} را در تنظیمات وارد کنید.`;

    $("hint").textContent = buildHint(meta, ready);
  }

  function buildHint(meta, ready) {
    if (!ready) {
      return `کلید ${meta.label} را در «تنظیمات کامل» وارد کنید یا یک مترجم رایگان انتخاب کنید.`;
    }
    if (settings.dubbing && settings.dubbingEngine === "gemini" && !settings.apiKeys.gemini) {
      return "دوبلهٔ Gemini به کلید نیاز دارد؛ فعلاً دوبلهٔ مرورگر فعال است.";
    }
    if (settings.dubbing && settings.dubbingEngine === "browser" && settings.targetLang === "fa") {
      return "برای دوبلهٔ مرورگر، باید یک صدای فارسی روی سیستم نصب باشد.";
    }
    if (settings.provider === "google") {
      return "بدون کلید و رایگان؛ سریع‌ترین گزینه برای تماشای روزمره.";
    }
    return meta.description;
  }

  function toast(text, kind = "", duration = 4000) {
    const status = $("status");
    clearTimeout(toastTimer);
    status.textContent = text || "";
    status.dataset.kind = kind;
    if (text && duration > 0) {
      toastTimer = setTimeout(() => {
        status.textContent = "";
        status.dataset.kind = "";
      }, duration);
    }
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error("سرویس افزونه پاسخ نداد."));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error || "درخواست ناموفق بود."));
          return;
        }
        resolve(response.result);
      });
    });
  }

  async function save(patch) {
    const stored = await chrome.storage.local.get("settings");
    const base = api.normalizeSettings(stored?.settings);
    const next = api.normalizeSettings(api.deepMerge(base, patch));
    settings = next;
    render();
    await chrome.storage.local.set({ settings: next });
  }

  /* -------------------------------------------------------------- events */

  function bind() {
    $("enabled").addEventListener("change", (event) => {
      void save({ enabled: event.target.checked });
      if (event.target.checked && !hasKey(settings.provider)) {
        toast("برای ترجمه با این مترجم، کلید API لازم است.", "warn", 5000);
      }
    });

    $("provider").addEventListener("change", (event) => {
      void save({ provider: event.target.value });
      toast("", "");
    });

    $("targetLang").addEventListener("change", (event) => {
      void save({ targetLang: event.target.value });
    });

    $("dubbing").addEventListener("change", (event) => {
      const on = event.target.checked;
      void save({ dubbing: on, enabled: on ? true : settings.enabled });
      if (on && settings.dubbingEngine === "gemini" && !settings.apiKeys.gemini) {
        toast("دوبلهٔ Gemini کلید لازم دارد؛ دوبلهٔ مرورگر استفاده می‌شود.", "warn", 5000);
      }
    });

    $("dubbingEngine").addEventListener("change", (event) => {
      void save({ dubbingEngine: event.target.value });
    });

    $("bilingual").addEventListener("change", (event) => {
      void save({ bilingual: event.target.checked });
    });

    $("themeToggle").addEventListener("click", () => {
      const next = settings.theme === "dark" ? "light" : "dark";
      settings.theme = next;
      applyTheme(next);
      void save({ theme: next });
    });
    $("settings").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    $("test").addEventListener("click", async () => {
      const button = $("test");
      if (button.disabled) return;
      const label = button.textContent;
      button.disabled = true;
      button.textContent = "در حال تست…";
      toast("", "");
      try {
        const result = await send({
          type: "translate",
          text: "Hello, this is a test.",
          provider: settings.provider,
          target: settings.targetLang,
          context: [],
        });
        toast(`✓ ${result.translation}`, "ok", 8000);
      } catch (error) {
        toast(error.message, "err", 8000);
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });

    $("clearCache").addEventListener("click", async () => {
      try {
        await send({ type: "clearCache" });
        toast("کش ترجمه پاک شد.", "ok", 2500);
      } catch (error) {
        toast(`خطا: ${error.message}`, "err", 5000);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.settings) {
        settings = api.normalizeSettings(changes.settings.newValue);
        render();
      }
    });
  }

  /* ----------------------------------------------------------------- boot */

  async function boot() {
    buildSelects();
    bind();

    const stored = await chrome.storage.local.get("settings");
    settings = api.normalizeSettings(stored?.settings);
    applyTheme(settings.theme);
    render();

    if (settings.enabled && !hasKey(settings.provider)) {
      toast("کلید API این مترجم تنظیم نشده است.", "warn", 6000);
    }
  }

  void boot();
})();
