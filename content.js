/* ============================================================================
 * YouTube Persian Translator — Content script
 * ----------------------------------------------------------------------------
 * موتور زیرنویس کم‌تأخیر:
 *   • MutationObserver فقط روی کانتینر زیرنویس (تشخیص فوری، بدون اسکن صفحه)
 *   • پیش‌نمایش فوری متن اصلی + استفاده از ترجمهٔ کش‌شدهٔ پیشوند
 *   • لغو درخواست‌های کهنه در سرویس‌ورکر (streamId)
 *   • گرم نگه‌داشتن سرویس‌ورکر برای حذف تأخیر بیدارشدن
 *   • کارت شناور قابل جابه‌جایی با ذخیرهٔ موقعیت
 * ==========================================================================*/

(() => {
  "use strict";

  const API = globalThis.YPT;
  if (!API || !globalThis.chrome?.runtime?.id) return;

  const { normalizeSettings, languageOf } = API;

  const CACHE_MAX = 400;
  const DUB_STABLE_MS = 620;
  const CAPTION_HINT_MS = 7000;
  const REQUEST_TIMEOUT_MS = 10000;
  const SAFETY_TICK_MS = 750;
  const KEEPALIVE_MS = 20000;

  // پس از آرام‌شدن متن، یک‌بار ترجمه می‌کنیم (نه برای هر کلمه)
const SETTLE_MS = 70;
const MAX_SETTLE_MS = 400;
// حداکثر نرخ تعویض متن کارت؛ کارت نباید چند بار در ثانیه بتپد
const COMMIT_MIN_MS = 320;
  // کارت هنگام مکث کوتاه زیرنویس پنهان نمی‌شود
  const HIDE_AFTER_MS = 7000;
  const SNAP_POLL_MS = 500;
  const SNAP_EPSILON_PX = 8;
  const SEGMENT_SELECTOR = ".ytp-caption-segment";

  const state = {
    settings: normalizeSettings(null),
    ready: false,

    lastRaw: "",
    lastRequestedRaw: "",
    translation: "",
    translationSource: "",
    shownSource: "",
    shownTranslation: "",
    context: [],

    pendingText: null,
    pendingAt: 0,
    inflight: false,
    generation: 0,
    commitHold: null,
    commitTimer: 0,
    lastCommitAt: 0,

    cache: new Map(),
    cacheProviderKey: "",

    enabledAt: 0,
    sawCaption: false,
    hintShown: false,
    warnedVoice: false,

    observer: null,
    observedContainer: null,
    safetyTimer: 0,
    keepTimer: 0,
    tickScheduled: false,

    snapTimer: 0,
    snapX: NaN,
    snapY: NaN,
    debounceTimer: 0,
    settleMaxTimer: 0,
    latencies: [],
    latencyEwma: 500,
    hideTimer: 0,
    metaTimer: 0,
    dubTimer: 0,
    dubPending: null,

    speakSeq: 0,
    activeAudio: null,
    duckVolume: null,

    pos: { x: 50, y: 82 },
    dragging: null,
  };

  function persianizeError(message) {
    const m = String(message || "");
    if (/failed to fetch|networkerror|network error/i.test(m)) return "اتصال به اینترنت برقرار نشد.";
    if (/extension context invalidated/i.test(m)) return "افزونه بارگذاری مجدد شد. صفحه را رفرش کنید.";
    if (/timeout|timed out/i.test(m)) return "مهلت درخواست تمام شد.";
    return m;
  }

  /* ---------------------------------------------------------------- overlay */

  const ui = createOverlay();

  function createOverlay() {
    const root = document.createElement("div");
    root.id = "ypt-overlay";
    root.dir = "rtl";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");

    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = "ypt-grip";
    grip.title = "جابه‌جایی کارت ترجمه (دوبار کلیک = بازنشانی)";
    grip.setAttribute("aria-label", "جابه‌جایی کارت ترجمه");
    grip.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/><circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/></svg>';

    const original = document.createElement("div");
    original.className = "ypt-original";

    const translation = document.createElement("div");
    translation.className = "ypt-translation";

    const meta = document.createElement("div");
    meta.className = "ypt-meta";

    const net = document.createElement("div");
    net.className = "ypt-net";
    net.setAttribute("aria-hidden", "true");

    root.append(grip, original, translation, meta, net);
    (document.body || document.documentElement).appendChild(root);

    return { root, grip, original, translation, meta, net };
  }

  function setStatus(text, kind = "", clearAfterMs = 0) {
    const value = text || "";
    const nextKind = kind || "";
    if (ui.meta.textContent === value && ui.meta.dataset.kind === nextKind) return;

    clearTimeout(state.metaTimer);
    ui.meta.textContent = value;
    ui.meta.title = value;
    ui.meta.dataset.kind = nextKind;
    ui.root.classList.toggle("ypt-busy", nextKind === "loading" && !state.translation);

    if (clearAfterMs > 0 && value) {
      state.metaTimer = setTimeout(() => {
        if (ui.meta.textContent === value) setStatus("", "");
      }, clearAfterMs);
    }
  }

  function updateNet() {
    if (!ui.net) return;
    const online = navigator.onLine;
    ui.net.textContent = "●";
    ui.net.style.color = online ? "var(--ok)" : "var(--err)";
    if (!online) {
      ui.net.title = "آفلاین";
      return;
    }
    const sorted = state.latencies.slice().sort((a, b) => a - b);
    const p95 = sorted.length ? Math.round(sorted[Math.floor(sorted.length * 0.95)]) : 0;
    ui.net.title = p95 > 0 ? `آنلاین · p95 ${p95} میلی‌ثانیه` : "آنلاین";
  }

  function showOverlay() {
    ui.root.classList.add("ypt-on");
  }

  function hideOverlay() {
    ui.root.classList.remove("ypt-on", "ypt-busy");
    clearNativeHidden();
  }

  function hideNative() {
    document.documentElement.classList.add("ypt-hide-native");
  }

  function clearNativeHidden() {
    document.documentElement.classList.remove("ypt-hide-native");
  }

  /* --------------------------------------------------------------- position */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function applyPosition(x, y) {
    const nextX = Math.round(x * 100) / 100;
    const nextY = Math.round(y * 100) / 100;
    if (state.pos.x === nextX && state.pos.y === nextY) return;

    state.pos = { x: nextX, y: nextY };
    ui.root.style.setProperty("--ypt-x", `${nextX}%`);
    ui.root.style.setProperty("--ypt-y", `${nextY}%`);
  }

  function clearHideTimer() {
    if (!state.hideTimer) return;
    clearTimeout(state.hideTimer);
    state.hideTimer = 0;
  }

  function anchorX() {
    const player = document.querySelector("#movie_player");
    const rect = player?.getBoundingClientRect();
    if (rect && rect.width > 20) return rect.left + rect.width / 2;

    const container = document.querySelector(".ytp-caption-window-container");
    const crect = container?.getBoundingClientRect();
    if (crect && crect.width > 20) return crect.left + crect.width / 2;

    return (window.innerWidth || 1) / 2;
  }

  // فقط پایینِ کادر متن زیرنویس را دنبال می‌کنیم؛ مرکز افقی از خود پخش‌کننده
  // می‌آید تا با کوتاه/بلند شدن متن، کارت افقی جابه‌جا نشود.
  function captionAnchorY() {
    let bottom = -Infinity;
    for (const node of document.querySelectorAll(SEGMENT_SELECTOR)) {
      const rect = node.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 6) continue;
      bottom = Math.max(bottom, rect.bottom);
    }
    if (bottom !== -Infinity) return bottom;

    const windowEl = document.querySelector(".ytp-caption-window-container .caption-window");
    const rect = windowEl?.getBoundingClientRect();
    if (rect && rect.width >= 10 && rect.height >= 6) return rect.bottom;

    return NaN;
  }

  function snapToCaptionContainer(force = false) {
    const bottomY = captionAnchorY();
    if (!Number.isFinite(bottomY)) return false;

    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const x = clamp((anchorX() / vw) * 100, 2, 98);
    const y = clamp(((bottomY - 4) / vh) * 100, 2, 98);

    // تغییرهای چندپیکسلی (مثلاً یک خط شدنِ متن) کارت را تکان نمی‌دهد
    if (
      !force &&
      Number.isFinite(state.snapX) &&
      Math.abs(x - state.snapX) < (SNAP_EPSILON_PX / vw) * 100 &&
      Math.abs(y - state.snapY) < (SNAP_EPSILON_PX / vh) * 100
    ) {
      return true;
    }

    state.snapX = x;
    state.snapY = y;
    ui.root.classList.add("ypt-snapped");
    applyPosition(x, y);
    return true;
  }

  function refreshSnap() {
    if (!state.settings.snapToCaptions) return;
    snapToCaptionContainer(true);
  }

  function startSnapTracking() {
    if (state.snapTimer) return;
    state.snapTimer = setInterval(() => {
      if (!state.settings.snapToCaptions) {
        stopSnapTracking();
        return;
      }
      if (state.dragging) return;
      snapToCaptionContainer();
    }, SNAP_POLL_MS);
  }

  function stopSnapTracking() {
    if (state.snapTimer) {
      clearInterval(state.snapTimer);
      state.snapTimer = 0;
    }
    state.snapX = NaN;
    state.snapY = NaN;
  }

  function applyPositionFromSettings(settings) {
    if (settings.snapToCaptions) {
      snapToCaptionContainer();
      startSnapTracking();
      return;
    }
    ui.root.classList.remove("ypt-snapped");
    stopSnapTracking();
    if (settings.position === "custom") {
      applyPosition(clamp(settings.overlayX, 2, 98), clamp(settings.overlayY, 2, 98));
      return;
    }
    if (settings.position === "top") {
      applyPosition(50, 15);
      return;
    }
    applyPosition(50, 82);
  }

  function setupDrag() {
    const grip = ui.grip;

    const onMove = (event) => {
      const drag = state.dragging;
      if (!drag || event.pointerId !== drag.id) return;

      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      const dx = ((event.clientX - drag.startX) / vw) * 100;
      const dy = ((event.clientY - drag.startY) / vh) * 100;
      if (Math.abs(event.clientX - drag.startX) > 2 || Math.abs(event.clientY - drag.startY) > 2) {
        drag.moved = true;
        ui.root.classList.remove("ypt-snapped");
      }

      const halfW = (drag.width / 2 / vw) * 100;
      const halfH = (drag.height / 2 / vh) * 100;

      const x = clamp(drag.x + dx, halfW + 0.5, 100 - halfW - 0.5);
      const y = clamp(drag.y + dy, halfH + 0.5, 100 - halfH - 0.5);
      applyPosition(x, y);
      event.preventDefault();
    };

    const onEnd = (event) => {
      const drag = state.dragging;
      if (!drag || (event && event.pointerId !== drag.id)) return;
      state.dragging = null;
      ui.root.classList.remove("ypt-dragging");

      if (!drag.moved) {
        // کلیک ساده روی دستگیره: حالت چسبیدن قبلی حفظ می‌شود
        if (state.settings.snapToCaptions) startSnapTracking();
        return;
      }

      let { x, y } = state.pos;
      if (Math.abs(x - 50) < 4) {
        x = 50;
        applyPosition(x, y);
      }

      // با جابه‌جایی دستی، چسبیدن به زیرنویس خاموش می‌شود تا کارت سر جای خود بماند
      const wasSnapped = state.settings.snapToCaptions;
      if (wasSnapped) {
        state.settings.snapToCaptions = false;
        stopSnapTracking();
        ui.root.classList.remove("ypt-snapped");
      }

      void send({
        type: "patchSettings",
        patch: wasSnapped
          ? { overlayX: x, overlayY: y, position: "custom", snapToCaptions: false }
          : { overlayX: x, overlayY: y, position: "custom" },
      }).catch(() => {});
    };

    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = ui.root.getBoundingClientRect();
      state.dragging = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: state.pos.x,
        y: state.pos.y,
        width: rect.width,
        height: rect.height,
        moved: false,
      };
      // در طول کشیدن، به‌روزرسانی خودکار چسبیدن متوقف می‌شود
      stopSnapTracking();
      ui.root.classList.add("ypt-dragging");
      try {
        grip.setPointerCapture(event.pointerId);
      } catch {
        /* نادیده بگیر */
      }
      event.preventDefault();
    });

    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onEnd);
    grip.addEventListener("pointercancel", onEnd);

    grip.addEventListener("dblclick", () => {
      applyPosition(50, 82);
      void send({
        type: "patchSettings",
        patch: { position: "bottom", overlayX: 50, overlayY: 82 },
      }).catch(() => {});
    });
  }

  /* --------------------------------------------------------------- captions */

  function readCaption() {
    const container = document.querySelector(".ytp-caption-window-container");
    const scope = container && container.querySelector(SEGMENT_SELECTOR) ? container : document;
    const nodes = scope.querySelectorAll(SEGMENT_SELECTOR);
    if (!nodes.length) return "";

    let out = "";
    for (const node of nodes) {
      const text = node.textContent;
      if (!text) continue;
      out += (out ? " " : "") + text;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function attachCaptionObserver() {
    const container = document.querySelector(".ytp-caption-window-container");
    if (!container || container === state.observedContainer) return;

    state.observer?.disconnect();
    state.observedContainer = container;
    state.observer = new MutationObserver(scheduleTick);
    state.observer.observe(container, { childList: true, subtree: true, characterData: true });
  }

  function scheduleTick() {
    if (state.tickScheduled) return;
    state.tickScheduled = true;
    requestAnimationFrame(() => {
      state.tickScheduled = false;
      tick();
    });
  }

  /**
   * آیا دو متن، ادامهٔ یک خط هستند؟ (رشد تدریجی یا اصلاح چند کلمه‌ای)
   * این کار از «خط جدید» شمردنِ اصلاح‌های خودکار یوتیوب جلوگیری می‌کند.
   */
  function sameCaptionLine(a, b) {
    if (!a || !b) return false;
    if (a === b || a.startsWith(b) || b.startsWith(a)) return true;

    const min = Math.min(a.length, b.length);
    if (min < 8) return false;

    let same = 0;
    while (same < min && a[same] === b[same]) same += 1;
    if (same >= 8 && same / min >= 0.65) return true;

    const aWords = new Set(a.split(" "));
    const bWords = b.split(" ");
    let hits = 0;
    for (const word of bWords) if (aWords.has(word)) hits += 1;
    return bWords.length > 0 && hits / bWords.length >= 0.7;
  }

  function tick() {
    if (!state.ready || !state.settings.enabled || document.hidden) return;

    const raw = readCaption();

    if (!raw) {
      if (state.lastRaw) {
        finishLine();
        state.lastRaw = "";
        state.lastRequestedRaw = "";
      }
      scheduleHide();
      maybeShowCaptionHint();
      return;
    }

    state.sawCaption = true;
    clearHideTimer();

    const previous = state.lastRaw;
    const isNewLine = previous && !sameCaptionLine(previous, raw);
    if (isNewLine) {
      finishLine();
      cancelInflight();
    }

    state.lastRaw = raw;

    if (raw === state.lastRequestedRaw) return;
    state.lastRequestedRaw = raw;

    if (state.settings.mode === "passthrough") {
      requestPassThrough(raw);
      return;
    }

    requestTranslation(raw);
  }

  function finishLine() {
    const text = state.lastRaw.trim();
    if (text) {
      const last = state.context[state.context.length - 1];
      if (last !== text) {
        state.context.push(text);
        if (state.context.length > 3) state.context.shift();
      }
    }
    flushCommit();
    flushDub();
  }

  function maybeShowCaptionHint() {
    if (state.sawCaption || state.hintShown) return;
    if (performance.now() - state.enabledAt < CAPTION_HINT_MS) return;
    state.hintShown = true;
    setStatus("برای شروع، زیرنویس یوتیوب (CC) را روشن کنید.", "notice", 8000);
  }

  function scheduleHide() {
    if (state.hideTimer) return;
    state.hideTimer = setTimeout(() => {
      state.hideTimer = 0;
      if (state.lastRaw) return;
      const video = document.querySelector("video");
      // هنگام مکث کارت می‌ماند تا کاربر بتواند راحت بخواند
      if (video && video.paused) return;
      hideOverlay();
    }, HIDE_AFTER_MS);
  }

  /* ------------------------------------------------------------ translation */

  function resetLocalCache() {
    state.cache.clear();
  }

  function cacheGet(text) {
    if (!state.cache.has(text)) return undefined;
    const value = state.cache.get(text);
    // LRU: تازه‌سازی ترتیب
    state.cache.delete(text);
    state.cache.set(text, value);
    return value;
  }

  function cacheSet(text, value) {
    state.cache.delete(text);
    state.cache.set(text, value);
    while (state.cache.size > CACHE_MAX) {
      state.cache.delete(state.cache.keys().next().value);
    }
  }

  function clearSettleTimers() {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = 0;
    }
    if (state.settleMaxTimer) {
      clearTimeout(state.settleMaxTimer);
      state.settleMaxTimer = 0;
    }
  }

  /**
   * هر خط فقط پس از «آرام‌شدن» متن (یا حداکثر ۴۸۰ms) یک‌بار به سرویس
   * فرستاده می‌شود؛ برای زیرنویس‌های کلمه‌به‌کلمه این کار هم درخواست‌ها را
   * چند برابر کم می‌کند و هم از تعویض‌های پشت‌سرهم روی کارت جلوگیری می‌کند.
   */
  function requestTranslation(text) {
    if (!text || text.trim().length < 2) return;

  const cached = cacheGet(text);
  if (cached !== undefined) {
    clearSettleTimers();
    state.pendingText = null;
    requestCommit(text, cached, 0);
    return;
  }

    const isFirstFragment = !state.pendingText;
    state.pendingText = text;

    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(pump, SETTLE_MS);

    if (isFirstFragment) {
      clearTimeout(state.settleMaxTimer);
      state.settleMaxTimer = setTimeout(pump, MAX_SETTLE_MS);
    }
  }

  function pump() {
    clearSettleTimers();
    const text = state.pendingText;
    if (!text) return;
    if (!state.settings.enabled || state.settings.mode === "passthrough") return;
    if (state.inflight) return;

    const cached = cacheGet(text);
    if (cached !== undefined) {
      state.pendingText = null;
      commitTranslation(text, cached, 0);
      if (state.pendingText) pump();
      return;
    }

    state.pendingText = null;
    state.inflight = true;
    const generation = state.generation;
    const started = performance.now();

    // فقط وقتی کارت هنوز چیزی ندارد، نشانگر ظریف نشان داده می‌شود
    if (!state.translation) setStatus("در حال ترجمه…", "loading");

    void (async () => {
      try {
        const result = await send({
          type: "translate",
          text,
          context: state.context,
          provider: state.settings.provider,
          target: state.settings.targetLang,
          streamId: "line",
        });

        cacheSet(text, result.translation);

        if (generation === state.generation && state.settings.enabled) {
          const elapsed = performance.now() - started;
          state.latencyEwma = Math.round(state.latencyEwma * 0.7 + elapsed * 0.3);
          state.latencies.push(elapsed);
          if (state.latencies.length > 20) state.latencies.shift();
          updateNet();
          requestCommit(text, result.translation, elapsed);
        }
      } catch (error) {
        if (error?.code !== "aborted" && generation === state.generation) {
          setStatus(`ترجمه ناموفق: ${persianizeError(error.message)}`, "error", 6000);
        }
      } finally {
        state.inflight = false;
        if (ui.meta.dataset.kind === "loading") setStatus("", "");
        if (state.pendingText) pump();
      }
    })();
  }

  /**
   * خط عوض شد یا کاربر جلو/عقب رفت: هر چیزی که در راه است بی‌اعتبار می‌شود
   * و درخواست شبکه‌ای هم واقعاً لغو می‌شود تا سهمیه و پهنای‌باند هدر نرود.
   */
  function cancelInflight() {
    state.pendingText = null;
    clearSettleTimers();
    clearTimeout(state.commitTimer);
    state.commitTimer = 0;
    state.commitHold = null;
    state.generation += 1;
    void send({ type: "cancel", streamId: "line" }).catch(() => {});
  }

  function applyCommit(hold) {
    if (!hold) return;
    if (hold.passthrough) commitPassThrough(hold.source);
    else commitTranslation(hold.source, hold.translation, hold.latency);
  }

  function requestCommit(source, translation, latency = 0) {
    if (!state.settings.enabled) return;
    const value = String(translation || "").trim();
    if (value.length < 2) return;

    const now = performance.now();
    if (now - state.lastCommitAt >= COMMIT_MIN_MS) {
      state.commitHold = null;
      commitTranslation(source, value, latency);
      return;
    }

    state.commitHold = { source, translation: value, latency };
    if (!state.commitTimer) {
      state.commitTimer = setTimeout(() => {
        state.commitTimer = 0;
        const hold = state.commitHold;
        state.commitHold = null;
        applyCommit(hold);
      }, Math.max(40, COMMIT_MIN_MS - (now - state.lastCommitAt)));
    }
  }

  function flushCommit() {
    if (state.commitTimer) {
      clearTimeout(state.commitTimer);
      state.commitTimer = 0;
    }
    const hold = state.commitHold;
    state.commitHold = null;
    applyCommit(hold);
  }

  function requestPassThrough(text) {
    const now = performance.now();
    if (now - state.lastCommitAt >= COMMIT_MIN_MS) {
      state.commitHold = null;
      commitPassThrough(text);
      return;
    }
    state.commitHold = { source: text, translation: text, latency: 0, passthrough: true };
    if (!state.commitTimer) {
      state.commitTimer = setTimeout(() => {
        state.commitTimer = 0;
        const hold = state.commitHold;
        state.commitHold = null;
        applyCommit(hold);
      }, Math.max(40, COMMIT_MIN_MS - (now - state.lastCommitAt)));
    }
  }

  function commitTranslation(source, translation, latency = 0) {
    if (!state.settings.enabled) return;
    const value = String(translation || "").trim();
    if (value.length < 2) return;

    state.translation = value;
    state.translationSource = source;
    state.shownSource = source;
    state.shownTranslation = value;
    state.lastCommitAt = performance.now();

    if (ui.translation.textContent !== value) ui.translation.textContent = value;
    const original = state.settings.bilingual ? source : "";
    if (ui.original.textContent !== original) ui.original.textContent = original;
    ui.translation.classList.remove("ypt-partial", "ypt-fade-out");

    showOverlay();
    if (state.settings.hideNativeCaptions) hideNative();
    else clearNativeHidden();

    if (ui.meta.dataset.kind === "error" || ui.meta.dataset.kind === "loading") setStatus("", "");

    if (state.settings.showLatency && latency > 0) {
      setStatus(`${Math.round(latency)} میلی‌ثانیه`, "", 1200);
    }

    scheduleDub(source, value);
  }

  function commitPassThrough(text) {
    if (!state.settings.enabled) return;
    if (!text) return;

    state.translation = text;
    state.translationSource = text;
    state.lastCommitAt = performance.now();

    if (ui.translation.textContent !== text) ui.translation.textContent = text;
    if (ui.original.textContent) ui.original.textContent = "";
    ui.translation.classList.remove("ypt-partial", "ypt-fade-out");

    showOverlay();
    if (state.settings.hideNativeCaptions) hideNative();
    else clearNativeHidden();
    setStatus("حالت فقط‌نمایش (بدون ترجمه)", "notice");
  }

  /* ----------------------------------------------------------------- dubbing */

  function scheduleDub(source, translation) {
    if (!state.settings.dubbing || !translation) return;
    clearTimeout(state.dubTimer);
    state.dubPending = { source, translation };
    state.dubTimer = setTimeout(() => {
      state.dubTimer = 0;
      void flushDub();
    }, DUB_STABLE_MS);
  }

  async function flushDub() {
    clearTimeout(state.dubTimer);
    state.dubTimer = 0;
    const pending = state.dubPending;
    state.dubPending = null;

    if (!pending || !state.settings.dubbing || !state.settings.enabled) return;
    if (state.settings.mode === "passthrough") return;

    await speak(pending.translation);
  }

  async function speak(text) {
    if (!text || !state.settings.enabled || !state.settings.dubbing) return;

    stopSpeaking();

    if (state.settings.dubbingEngine === "browser") {
      speakBrowser(text);
      return;
    }

    const seq = state.speakSeq;
    try {
      const result = await send({ type: "speak", text, engine: "gemini" });
      if (seq !== state.speakSeq || !state.settings.enabled || !state.settings.dubbing) return;
      if (!result?.audio) return;

      playAudio(toAudioBlob(result.audio, result.mimeType));
    } catch (error) {
      if (seq === state.speakSeq) {
        setStatus(`دوبله ناموفق: ${persianizeError(error.message)}`, "error", 5000);
      }
    }
  }

  function langTag(code) {
    return code === "fa" ? "fa-IR" : code;
  }

  function pickVoice(code) {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const tag = langTag(code).toLowerCase();
    return (
      voices.find((voice) => voice.lang.toLowerCase() === tag) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith(code.toLowerCase())) ||
      null
    );
  }

  function speakBrowser(text) {
    if (!("speechSynthesis" in window)) {
      setStatus("مرورگر از دوبله پشتیبانی نمی‌کند.", "error", 5000);
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langTag(state.settings.targetLang);
    utterance.rate = 1.02;
    utterance.pitch = 1;

    const voice = pickVoice(state.settings.targetLang);
    if (voice) {
      utterance.voice = voice;
    } else if (state.settings.targetLang === "fa" && !state.warnedVoice) {
      state.warnedVoice = true;
      setStatus("صدای فارسی در مرورگر نصب نیست؛ دوبلهٔ Gemini را امتحان کنید.", "notice", 7000);
    }

    synth.speak(utterance);
  }

  function stopSpeaking() {
    state.speakSeq += 1;

    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* نادیده بگیر */
      }
    }

    if (state.activeAudio) {
      try {
        state.activeAudio.pause();
        state.activeAudio.src = "";
      } catch {
        /* نادیده بگیر */
      }
      state.activeAudio = null;
    }

    duckVideo(false);
  }

  function playAudio(blob) {
    stopSpeaking();

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    state.activeAudio = audio;
    duckVideo(true);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (state.activeAudio === audio) state.activeAudio = null;
      duckVideo(false);
    };

    audio.onended = cleanup;
    audio.onerror = cleanup;
    audio.play().catch((error) => {
      cleanup();
      setStatus(`پخش صدا ناموفق بود: ${persianizeError(error.message)}`, "error", 4000);
    });
  }

  function duckVideo(down) {
    const video = document.querySelector("video");
    if (!video) return;

    if (down) {
      if (state.duckVolume === null) state.duckVolume = video.volume;
      video.volume = Math.min(video.volume, 0.15);
    } else if (state.duckVolume !== null) {
      video.volume = state.duckVolume;
      state.duckVolume = null;
    }
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function pcmToWav(bytes, sampleRate) {
    const buffer = new ArrayBuffer(44 + bytes.length);
    const view = new DataView(buffer);
    const writeText = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };

    writeText(0, "RIFF");
    view.setUint32(4, 36 + bytes.length, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, bytes.length, true);
    new Uint8Array(buffer, 44).set(bytes);
    return buffer;
  }

  function toAudioBlob(base64, mimeType) {
    const bytes = base64ToBytes(base64);
    const type = String(mimeType || "");
    if (/wav/i.test(type)) return new Blob([bytes], { type: "audio/wav" });
    const rate = Number((type.match(/rate=(\d+)/i) || [])[1]) || 24000;
    return new Blob([pcmToWav(bytes, rate)], { type: "audio/wav" });
  }

  /* --------------------------------------------------------------- messaging */

  function send(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("پاسخی از سرویس ترجمه دریافت نشد."));
      }, REQUEST_TIMEOUT_MS);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          if (chrome.runtime.lastError) {
            reject(new Error(persianizeError(chrome.runtime.lastError.message)));
            return;
          }
          if (!response) {
            reject(new Error("سرویس ترجمه پاسخ نداد."));
            return;
          }
          if (!response.ok) {
            const error = new Error(response.error || "درخواست ناموفق بود.");
            error.code = response.code || "";
            reject(error);
            return;
          }
          resolve(response.result);
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /* -------------------------------------------------------------- lifecycle */

  function resetPlaybackState() {
    state.lastRaw = "";
    state.lastRequestedRaw = "";
    cancelInflight();
    clearSettleTimers();
    clearHideTimer();
    state.context.length = 0;
    clearTimeout(state.dubTimer);
    state.dubTimer = 0;
    state.dubPending = null;
    stopSpeaking();
    ui.translation.textContent = "";
    ui.original.textContent = "";
    ui.translation.classList.remove("ypt-partial", "ypt-fade-out");
    state.translation = "";
    state.translationSource = "";
    state.shownSource = "";
    state.shownTranslation = "";
    hideOverlay();
    setStatus("", "");
  }

  function applySettings(raw) {
    const previous = state.settings;
    const next = normalizeSettings(raw);
    state.settings = next;

    const providerKey = `${next.provider}|${next.targetLang}`;
    if (state.cacheProviderKey && state.cacheProviderKey !== providerKey) resetLocalCache();
    state.cacheProviderKey = providerKey;

    ui.root.dir = languageOf(next.targetLang).rtl ? "rtl" : "ltr";
    ui.root.dataset.theme = next.theme === "light" ? "light" : "dark";
    ui.root.style.setProperty("--ypt-size", `${next.fontSize}px`);
    ui.root.style.setProperty("--ypt-opacity", String(next.opacity));
    ui.original.classList.toggle("ypt-hidden", !next.bilingual);
    applyPositionFromSettings(next);
    updateNet();

    if (!next.enabled) {
      clearNativeHidden();
      stopSnapTracking();
      clearHideTimer();
      if (previous.enabled) resetPlaybackState();
      else hideOverlay();
      return;
    }

    if (!previous.enabled) {
      state.enabledAt = performance.now();
      void send({ type: "ping" }).catch(() => {});
      // اتصال TLS/HTTP2 را قبل از اولین زیرنویس گرم می‌کنیم
      void send({ type: "warmup" }).catch(() => {});
      state.sawCaption = false;
      state.hintShown = false;
      state.context.length = 0;
      state.lastRaw = "";
      state.lastRequestedRaw = "";
      state.pendingText = null;
      state.generation += 1;
      void send({ type: "cancel", streamId: "line" }).catch(() => {});
      setStatus("", "");
    }

    if (!next.dubbing) {
      clearTimeout(state.dubTimer);
      state.dubTimer = 0;
      state.dubPending = null;
      stopSpeaking();
    }

    if (state.translation) {
      showOverlay();
      if (next.hideNativeCaptions) hideNative();
      else clearNativeHidden();
    }
  }

  /* ------------------------------------------------------------ subscribe */

  chrome.storage.local.get("settings", (stored) => {
    state.ready = true;
    state.lastRequestedRaw = "";
    applySettings(stored?.settings);
    start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) applySettings(changes.settings.newValue);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "cacheCleared") resetLocalCache();
    return false;
  });

  function start() {
    attachCaptionObserver();
    setupDrag();

    state.safetyTimer = setInterval(() => {
      attachCaptionObserver();
      tick();
    }, SAFETY_TICK_MS);

    // گرم نگه‌داشتن سرویس‌ورکر تا اولین ترجمهٔ هر خط تأخیر بیدارشدن نداشته باشد
    state.keepTimer = setInterval(() => {
      try {
        if (!chrome?.runtime?.id) return;
        if (!state.settings.enabled || document.hidden) return;
        chrome.runtime.sendMessage({ type: "ping" }, () => {
          try {
            void chrome.runtime.lastError;
          } catch {
            /* نادیده بگیر */
          }
        });
      } catch {
        /* نادیده بگیر */
      }
    }, KEEPALIVE_MS);

    window.addEventListener("online", () => {
      updateNet();
      void send({ type: "ping" }).catch(() => {});
    });
    window.addEventListener("offline", updateNet);
    window.addEventListener("resize", refreshSnap, { passive: true });
    window.addEventListener("orientationchange", refreshSnap, { passive: true });
    document.addEventListener("fullscreenchange", refreshSnap, true);

    document.addEventListener("seeking", () => resetPlaybackState(), true);
    document.addEventListener(
      "pause",
      (event) => {
        if (event.target?.tagName === "VIDEO") stopSpeaking();
      },
      true,
    );
    document.addEventListener("yt-navigate-finish", () => {
      resetPlaybackState();
      state.observedContainer = null;
      attachCaptionObserver();
      void send({ type: "ping" }).catch(() => {});
    });
    window.addEventListener("popstate", () => {
      resetPlaybackState();
      state.observedContainer = null;
      attachCaptionObserver();
    });

    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener?.("voiceschanged", () => {
        window.speechSynthesis.getVoices();
      });
    }

    if (state.settings.enabled) {
      state.enabledAt = performance.now();
      applySettings(state.settings);
      void send({ type: "warmup" }).catch(() => {});
      tick();
    }
  }
})();
