/* ============================================================================
 * YouTube Persian Translator — Options page
 * ==========================================================================*/

(() => {
  "use strict";

  const api = globalThis.YPT;
  const $ = (id) => document.getElementById(id);

  const PROVIDER_KEYS = ["gemini"];

  let settings = api.normalizeSettings(null);
  let pendingPatch = {};
  let saveTimer = 0;
  let saveStateTimer = 0;
  let statusTimer = 0;

  /* ---------------------------------------------------------------- utils */

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

  function setStatus(text, kind = "", duration = 5000) {
    const node = $("status");
    clearTimeout(statusTimer);
    node.textContent = text || "";
    node.dataset.kind = kind;
    if (text && duration > 0) {
      statusTimer = setTimeout(() => {
        node.textContent = "";
        node.dataset.kind = "";
      }, duration);
    }
  }

  function flashSaved(kind = "ok") {
    const node = $("save-state");
    clearTimeout(saveStateTimer);
    node.textContent = kind === "ok" ? "ذخیره شد ✓" : "خطا در ذخیره";
    node.dataset.kind = kind;
    saveStateTimer = setTimeout(() => {
      node.textContent = "";
      node.dataset.kind = "";
    }, 1800);
  }

  /* ---------------------------------------------------------------- save */

  function queueSave(patch, delay = 0) {
    Object.assign(pendingPatch, patch);
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    if (delay > 0) {
      saveTimer = setTimeout(() => {
        saveTimer = 0;
        void flushSave();
      }, delay);
      return;
    }
    void flushSave();
  }

  async function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    const patch = pendingPatch;
    pendingPatch = {};
    if (!Object.keys(patch).length) return settings;

    try {
      const stored = await chrome.storage.local.get("settings");
      const next = api.normalizeSettings(
        api.deepMerge(api.normalizeSettings(stored?.settings), patch),
      );
      settings = next;
      await chrome.storage.local.set({ settings: next });
      flashSaved("ok");
      return next;
    } catch (error) {
      flashSaved("err");
      setStatus(`ذخیره نشد: ${error.message}`, "err");
      return settings;
    }
  }

  /* --------------------------------------------------------------- selects */

  function fillSelect(select, items, currentValue) {
    select.textContent = "";
    const values = items.slice();
    if (currentValue && !values.includes(currentValue)) values.push(currentValue);

    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    if (currentValue) select.value = currentValue;
  }

  function buildSelects() {
    const providerSelect = $("provider");
    for (const id of api.PROVIDER_ORDER) {
      const meta = api.PROVIDERS[id];
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

    const ttsSelect = $("model-geminiTts");
    for (const model of api.GEMINI_TTS_MODELS) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      ttsSelect.append(option);
    }

    const voiceSelect = $("geminiVoice");
    for (const voice of api.GEMINI_VOICES) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.label;
      voiceSelect.append(option);
    }
  }

  /* ---------------------------------------------------------------- render */

  function highlightProvider() {
    for (const card of document.querySelectorAll(".provider-card")) {
      card.classList.toggle("active", card.dataset.provider === settings.provider);
    }
  }

  function applyThemeMode(theme) {
    const mode = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = mode;
    for (const button of document.querySelectorAll("[data-theme-mode]")) {
      const active = button.dataset.themeMode === mode;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function render() {
    applyThemeMode(settings.theme);
    $("provider").value = settings.provider;
    $("targetLang").value = settings.targetLang;
    $("mode").value = settings.mode;
    $("contextLines").value = String(settings.contextLines);
    $("fallbackToGoogle").checked = settings.fallbackToGoogle;
    $("showLatency").checked = settings.showLatency;

    for (const provider of PROVIDER_KEYS) {
      const input = $(`key-${provider}`);
      if (input) input.value = settings.apiKeys[provider] || "";
      const toggle = $(`toggle-${provider}`);
      if (toggle) {
        input.type = "password";
        toggle.textContent = "👁";
      }
    }

    $("model-geminiTts").value = settings.models.geminiTts;
    $("geminiVoice").value = settings.geminiVoice;

    $("bilingual").checked = settings.bilingual;
    $("hideNativeCaptions").checked = settings.hideNativeCaptions;
    $("snapToCaptions").checked = settings.snapToCaptions;
    $("position").value = settings.position;
    $("fontSize").value = String(settings.fontSize);
    $("opacity").value = String(settings.opacity);
    $("fontSizeValue").textContent = `${settings.fontSize}px`;
    $("opacityValue").textContent = `${Math.round(settings.opacity * 100)}٪`;

    $("dubbing").checked = settings.dubbing;
    $("dubbingEngine").value = settings.dubbingEngine;

    highlightProvider();
  }

  /* ---------------------------------------------------------------- events */

  function originPattern(rawUrl) {
    try {
      const url = new URL(String(rawUrl || "").trim());
      if (!/^https?:$/.test(url.protocol)) return null;
      return `${url.protocol}//${url.host}/*`;
    } catch {
      return null;
    }
  }

  function bind() {
    $("provider").addEventListener("change", (event) => {
      settings.provider = event.target.value;
      highlightProvider();
      queueSave({ provider: event.target.value });
    });

    $("targetLang").addEventListener("change", (event) => {
      queueSave({ targetLang: event.target.value });
    });

    $("mode").addEventListener("change", (event) => {
      queueSave({ mode: event.target.value });
    });

    $("contextLines").addEventListener("change", (event) => {
      queueSave({ contextLines: Number(event.target.value) });
    });

    $("fallbackToGoogle").addEventListener("change", (event) => {
      queueSave({ fallbackToGoogle: event.target.checked });
    });

    $("showLatency").addEventListener("change", (event) => {
      queueSave({ showLatency: event.target.checked });
    });

    for (const provider of PROVIDER_KEYS) {
      const input = $(`key-${provider}`);
      if (!input) continue;

      input.addEventListener("input", () => {
        queueSave({ apiKeys: { [provider]: input.value } }, 600);
      });

      const toggle = $(`toggle-${provider}`);
      if (toggle) {
        toggle.addEventListener("click", () => {
          const show = input.type === "password";
          input.type = show ? "text" : "password";
          toggle.textContent = show ? "🙈" : "👁";
        });
      }

      const testButton = $(`test-${provider}`);
      if (testButton) {
        testButton.addEventListener("click", async () => {
          if (testButton.disabled) return;
          const label = testButton.textContent;
          testButton.disabled = true;
          testButton.textContent = "…";
          try {
            await flushSave();
            const result = await send({ type: "testProvider", provider });
            setStatus(
              `✓ ${api.PROVIDERS[provider].label}: «${result.translation}» — ${result.ms} میلی‌ثانیه`,
              "ok",
              9000,
            );
          } catch (error) {
            setStatus(error.message, "err", 9000);
          } finally {
            testButton.disabled = false;
            testButton.textContent = label;
          }
        });
      }
    }

    for (const id of ["model-gemini", "model-openai"]) {
      const select = $(id);
      if (!select) continue;
      select.addEventListener("change", (event) => {
        const key = id === "model-gemini" ? "gemini" : "openai";
        queueSave({ models: { [key]: event.target.value } });
      });
    }

    $("model-geminiTts").addEventListener("change", (event) => {
      queueSave({ models: { geminiTts: event.target.value } });
    });

    $("geminiVoice").addEventListener("change", (event) => {
      queueSave({ geminiVoice: event.target.value });
    });

    $("bilingual").addEventListener("change", (event) => {
      queueSave({ bilingual: event.target.checked });
    });

    $("hideNativeCaptions").addEventListener("change", (event) => {
      queueSave({ hideNativeCaptions: event.target.checked });
    });
    $("snapToCaptions").addEventListener("change", (event) => {
      queueSave({ snapToCaptions: event.target.checked });
    });

    $("position").addEventListener("change", (event) => {
      settings.snapToCaptions = false;
      $("snapToCaptions").checked = false;
      queueSave({ position: event.target.value, snapToCaptions: false });
    });

    $("resetPosition").addEventListener("click", () => {
      settings.snapToCaptions = false;
      $("snapToCaptions").checked = false;
      queueSave({ position: "bottom", overlayX: 50, overlayY: 82, snapToCaptions: false });
      setStatus("موقعیت کارت به پایین تصویر برگشت.", "ok", 3000);
    });

    $("fontSize").addEventListener("input", (event) => {
      const value = Number(event.target.value);
      $("fontSizeValue").textContent = `${value}px`;
      queueSave({ fontSize: value }, 250);
    });

    $("opacity").addEventListener("input", (event) => {
      const value = Number(event.target.value);
      $("opacityValue").textContent = `${Math.round(value * 100)}٪`;
      queueSave({ opacity: value }, 250);
    });

    $("dubbing").addEventListener("change", (event) => {
      queueSave({ dubbing: event.target.checked });
    });

    $("dubbingEngine").addEventListener("change", (event) => {
      queueSave({ dubbingEngine: event.target.value });
    });

    $("clearCache").addEventListener("click", async () => {
      try {
        await send({ type: "clearCache" });
        setStatus("کش ترجمه پاک شد.", "ok", 3000);
      } catch (error) {
        setStatus(`خطا: ${error.message}`, "err");
      }
    });

    $("resetSettings").addEventListener("click", async () => {
      if (!window.confirm("همهٔ تنظیمات به حالت پیش‌فرض برگردد؟")) return;
      await chrome.storage.local.set({ settings: api.normalizeSettings(null) });
      settings = api.normalizeSettings(null);
      render();
      setStatus("تنظیمات به حالت پیش‌فرض برگشت.", "ok", 3000);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      settings = api.normalizeSettings(changes.settings.newValue);
      const active = document.activeElement;
      const typing = active && (active.tagName === "INPUT" || active.tagName === "SELECT");
      if (!typing) render();
    });

    window.addEventListener("beforeunload", () => {
      if (Object.keys(pendingPatch).length) void flushSave();
    });
  }

  /* ------------------------------------------------------------------ boot */

  function bindThemeModes() {
    for (const button of document.querySelectorAll("[data-theme-mode]")) {
      button.addEventListener("click", () => {
        const theme = button.dataset.themeMode === "light" ? "light" : "dark";
        if (settings.theme === theme) return;
        settings.theme = theme;
        applyThemeMode(theme);
        queueSave({ theme });
        setStatus(`حالت ${theme === "light" ? "روشن" : "تاریک"} انتخاب شد.`, "ok", 2000);
      });
    }
  }

  async function boot() {
    buildSelects();
    bind();
    bindThemeModes();

    const stored = await chrome.storage.local.get("settings");
    settings = api.normalizeSettings(stored?.settings);
    applyThemeMode(settings.theme);
    render();
  }

  void boot();
})();
