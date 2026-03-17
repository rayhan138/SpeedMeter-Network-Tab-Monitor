(() => {
  if (window.top !== window) return;

  const DEFAULT_SETTINGS = {
    overlayVisible: true,
    collapsed: true,
    opacity: 85,
    theme: "dark",
    tabsToShow: 5,
    memoryThresholdMB: 500,
    position: null,
    metrics: {
      bandwidth: true,
      tabs: true,
      history: true,
      totals: true
    }
  };

  const state = {
    settings: normalizeSettings(DEFAULT_SETTINGS),
    snapshot: null,
    position: null,
    drag: null,
    menuTabId: null,
    refs: null
  };

  function normalizeSettings(input = {}) {
    return {
      ...DEFAULT_SETTINGS,
      ...input,
      metrics: {
        ...DEFAULT_SETTINGS.metrics,
        ...(input.metrics || {})
      }
    };
  }

  init();

  async function init() {
    try {
      const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      state.settings = normalizeSettings(stored);
    } catch (err) {
      console.error("SpeedMeter settings load failed:", err);
    }

    buildOverlay();
    bindEvents();

    state.position = state.settings.position || getDefaultPosition();

    applySettings();
    refreshSnapshot();
    setInterval(refreshSnapshot, 1000);
  }

  function buildOverlay() {
    const host = document.createElement("div");
    host.id = "__speedmeter_host__";
    host.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: 0;
      height: 0;
      z-index: 2147483647;
      pointer-events: none;
    `;

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }

        #container {
          --panel-opacity: 0.85;
          --panel-rgb: 15, 23, 42;
          --fg: #e5e7eb;
          --muted: #94a3b8;
          --border: rgba(148, 163, 184, 0.25);
          --accent: #38bdf8;
          --soft-bg: rgba(255, 255, 255, 0.06);
          position: fixed;
          width: 286px;
          color: var(--fg);
          font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: auto;
        }

        #container.compact {
          width: 176px;
        }

        #container.hidden { display: none; }

        #container.theme-dark {
          --panel-rgb: 15, 23, 42;
          --fg: #e5e7eb;
          --muted: #94a3b8;
          --border: rgba(148, 163, 184, 0.25);
          --accent: #38bdf8;
          --soft-bg: rgba(255, 255, 255, 0.06);
        }

        #container.theme-light {
          --panel-rgb: 255, 255, 255;
          --fg: #111827;
          --muted: #6b7280;
          --border: rgba(17, 24, 39, 0.12);
          --accent: #2563eb;
          --soft-bg: rgba(17, 24, 39, 0.05);
        }

        #container.theme-ocean {
          --panel-rgb: 4, 47, 46;
          --fg: #ecfeff;
          --muted: #99f6e4;
          --border: rgba(45, 212, 191, 0.25);
          --accent: #2dd4bf;
          --soft-bg: rgba(255, 255, 255, 0.08);
        }

        .card {
          background: rgba(var(--panel-rgb), var(--panel-opacity));
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          overflow: hidden;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 9px 10px;
          border-bottom: 1px solid var(--border);
          cursor: move;
          user-select: none;
        }

        .title {
          font-size: 13px;
          font-weight: 700;
        }

        .subtle {
          color: var(--muted);
          font-size: 11px;
        }

        .icon-btn {
          border: 1px solid var(--border);
          background: var(--soft-bg);
          color: var(--fg);
          border-radius: 8px;
          width: 26px;
          height: 26px;
          cursor: pointer;
          flex: 0 0 auto;
        }

        .summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 9px 10px;
        }

        #container.compact .summary {
          gap: 6px;
          padding: 8px;
        }

        .metric {
          border: 1px solid var(--border);
          background: var(--soft-bg);
          border-radius: 10px;
          padding: 8px;
          min-width: 0;
        }

        #container.compact .metric {
          padding: 6px;
          border-radius: 8px;
        }

        .metric .label {
          color: var(--muted);
          font-size: 11px;
        }

        #container.compact .metric .label,
        #container.compact #downNote,
        #container.compact #upNote {
          display: none;
        }

        .metric .value {
          font-size: 15px;
          font-weight: 700;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        #container.compact .metric .value {
          font-size: 11px;
          margin-top: 0;
        }

        .mini-strip {
          display: none;
          padding: 0 8px 8px;
        }

        #container.compact .mini-strip {
          display: block;
        }

        .mini-strip-inner {
          border: 1px solid var(--border);
          background: var(--soft-bg);
          border-radius: 8px;
          padding: 5px 7px;
          color: var(--muted);
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .section {
          padding: 0 10px 10px;
        }

        #container.compact .section {
          display: none !important;
        }

        .section-title {
          font-size: 11px;
          color: var(--muted);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .row {
          display: grid;
          grid-template-columns: auto auto 1fr auto;
          gap: 8px;
          align-items: center;
          border: 1px solid var(--border);
          background: var(--soft-bg);
          border-radius: 10px;
          padding: 8px;
          cursor: pointer;
        }

        .row.top {
          outline: 1px solid var(--accent);
        }

        .rank {
          width: 16px;
          text-align: center;
          color: var(--muted);
          font-weight: 700;
        }

        .fav {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          object-fit: cover;
          background: var(--soft-bg);
        }

        .main {
          min-width: 0;
        }

        .title-line,
        .file-line {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
        }

        .host-line,
        .detail-line {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--muted);
          font-size: 11px;
          margin-top: 1px;
        }

        .mem {
          font-weight: 700;
          white-space: nowrap;
        }

        .totals-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }

        .stat {
          border: 1px solid var(--border);
          background: var(--soft-bg);
          border-radius: 10px;
          padding: 8px;
        }

        .stat .k {
          color: var(--muted);
          font-size: 11px;
        }

        .stat .v {
          font-weight: 700;
          margin-top: 2px;
        }

        .graph-row {
          display: grid;
          grid-template-columns: 34px 1fr;
          gap: 8px;
          align-items: center;
          margin-bottom: 6px;
        }

        .graph-row span {
          color: var(--muted);
          font-size: 11px;
        }

        canvas {
          display: block;
          width: 100%;
          height: 28px;
          border: 1px solid var(--border);
          background: var(--soft-bg);
          border-radius: 8px;
        }

        #ctxMenu {
          position: fixed;
          min-width: 140px;
          background: rgba(var(--panel-rgb), 0.98);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.25);
          padding: 6px;
          pointer-events: auto;
        }

        #ctxMenu[hidden] { display: none; }

        #ctxMenu button {
          display: block;
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          color: var(--fg);
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          font: inherit;
        }

        #ctxMenu button:hover {
          background: var(--soft-bg);
        }

        .empty {
          border: 1px dashed var(--border);
          border-radius: 10px;
          padding: 10px;
          color: var(--muted);
          text-align: center;
        }
      </style>

      <div id="container" class="theme-dark compact">
        <div class="card">
          <div class="header" id="header">
            <div>
              <div class="title" id="titleText">SM</div>
              <div class="subtle" id="meta">Precision mode</div>
            </div>
            <button class="icon-btn" id="collapseBtn" title="Expand / Collapse">▸</button>
          </div>

          <div class="summary">
            <div class="metric">
              <div class="label">Download</div>
              <div class="value" id="downRate">↓ 0 KB/s</div>
              <div class="subtle" id="downNote">Live all tabs + exact file downloads</div>
            </div>
            <div class="metric">
              <div class="label">Upload</div>
              <div class="value" id="upRate">↑ 0 KB/s</div>
              <div class="subtle" id="upNote">Live all tabs</div>
            </div>
          </div>

          <div id="miniStrip" class="mini-strip"></div>

          <div class="section" id="downloadsSection">
            <div class="section-title">Active file downloads</div>
            <div class="list" id="downloadsList"></div>
          </div>

          <div class="section" id="tabsSection">
            <div class="section-title">Top tabs by memory</div>
            <div class="list" id="tabsList"></div>
          </div>

          <div class="section" id="totalsSection">
            <div class="section-title">Session totals</div>
            <div class="totals-grid" id="totalsGrid"></div>
          </div>

          <div class="section" id="historySection">
            <div class="section-title">Last 5 minutes</div>
            <div class="graph-row"><span>↓</span><canvas id="downCanvas"></canvas></div>
            <div class="graph-row"><span>↑</span><canvas id="upCanvas"></canvas></div>
            <div class="graph-row"><span>RAM</span><canvas id="memCanvas"></canvas></div>
          </div>
        </div>

        <div id="ctxMenu" hidden>
          <button data-action="reload">Reload Tab</button>
          <button data-action="close">Close Tab</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(host);

    state.refs = {
      host,
      shadow,
      container: shadow.getElementById("container"),
      header: shadow.getElementById("header"),
      titleText: shadow.getElementById("titleText"),
      meta: shadow.getElementById("meta"),
      collapseBtn: shadow.getElementById("collapseBtn"),
      downRate: shadow.getElementById("downRate"),
      upRate: shadow.getElementById("upRate"),
      downNote: shadow.getElementById("downNote"),
      upNote: shadow.getElementById("upNote"),
      miniStrip: shadow.getElementById("miniStrip"),
      downloadsSection: shadow.getElementById("downloadsSection"),
      downloadsList: shadow.getElementById("downloadsList"),
      tabsSection: shadow.getElementById("tabsSection"),
      tabsList: shadow.getElementById("tabsList"),
      totalsSection: shadow.getElementById("totalsSection"),
      totalsGrid: shadow.getElementById("totalsGrid"),
      historySection: shadow.getElementById("historySection"),
      downCanvas: shadow.getElementById("downCanvas"),
      upCanvas: shadow.getElementById("upCanvas"),
      memCanvas: shadow.getElementById("memCanvas"),
      ctxMenu: shadow.getElementById("ctxMenu")
    };
  }

  function bindEvents() {
    state.refs.collapseBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      state.settings.collapsed = !state.settings.collapsed;
      await chrome.storage.sync.set({ collapsed: state.settings.collapsed });
      applySettings();
      render(state.snapshot);
    });

    state.refs.header.addEventListener("mousedown", onDragStart);

    state.refs.tabsList.addEventListener("click", async (event) => {
      const row = event.target.closest(".row[data-tab-id]");
      if (!row) return;
      const tabId = Number(row.dataset.tabId);
      if (!Number.isInteger(tabId)) return;
      await chrome.runtime.sendMessage({ type: "activateTab", tabId }).catch(() => {});
    });

    state.refs.tabsList.addEventListener("contextmenu", (event) => {
      const row = event.target.closest(".row[data-tab-id]");
      if (!row) return;

      event.preventDefault();
      state.menuTabId = Number(row.dataset.tabId);
      openContextMenu(event.clientX, event.clientY);
    });

    state.refs.ctxMenu.addEventListener("click", async (event) => {
      const action = event.target.dataset.action;
      if (!action || !Number.isInteger(state.menuTabId)) return;

      if (action === "reload") {
        await chrome.runtime.sendMessage({
          type: "reloadTab",
          tabId: state.menuTabId
        }).catch(() => {});
      } else if (action === "close") {
        await chrome.runtime.sendMessage({
          type: "closeTab",
          tabId: state.menuTabId
        }).catch(() => {});
      }

      hideContextMenu();
    });

    window.addEventListener("resize", () => {
      clampPosition();
      applyPosition();
    });

    window.addEventListener("scroll", hideContextMenu, true);
    document.addEventListener("click", hideContextMenu, true);

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "overlayVisibility") {
        state.settings.overlayVisible = !!message.visible;
        applySettings();
      }

      if (message?.type === "settingsChanged") {
        state.settings = normalizeSettings(message.settings || state.settings);
        if (state.settings.position) state.position = state.settings.position;
        applySettings();
        render(state.snapshot);
      }
    });

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== "sync") return;

      const interestingKeys = [
        "overlayVisible",
        "collapsed",
        "opacity",
        "theme",
        "tabsToShow",
        "memoryThresholdMB",
        "position",
        "metrics"
      ];

      const changed = Object.keys(changes).some((key) =>
        interestingKeys.includes(key)
      );
      if (!changed) return;

      const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      state.settings = normalizeSettings(stored);
      if (state.settings.position) state.position = state.settings.position;
      applySettings();
      render(state.snapshot);
    });
  }

  function onDragStart(event) {
    if (event.button !== 0) return;
    if (event.target.closest("#collapseBtn")) return;

    hideContextMenu();

    state.drag = {
      offsetX: event.clientX - state.position.x,
      offsetY: event.clientY - state.position.y
    };

    const onMove = (moveEvent) => {
      if (!state.drag) return;
      state.position = {
        x: moveEvent.clientX - state.drag.offsetX,
        y: moveEvent.clientY - state.drag.offsetY
      };
      clampPosition();
      applyPosition();
    };

    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      state.drag = null;

      try {
        await chrome.storage.sync.set({ position: state.position });
      } catch (err) {
        console.error("Failed to save position:", err);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function openContextMenu(x, y) {
    const menu = state.refs.ctxMenu;
    menu.hidden = false;

    const maxX = window.innerWidth - 150;
    const maxY = window.innerHeight - 100;

    menu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
  }

  function hideContextMenu() {
    state.menuTabId = null;
    state.refs.ctxMenu.hidden = true;
  }

  async function refreshSnapshot() {
    try {
      const metrics = collectMetrics();
      const snapshot = await chrome.runtime.sendMessage({
        type: "reportTabMetrics",
        metrics
      });

      if (!snapshot) return;
      state.snapshot = snapshot;

      if (snapshot.settings) {
        state.settings = normalizeSettings(snapshot.settings);
        if (state.settings.position && !state.drag) {
          state.position = state.settings.position;
        }
      }

      applySettings();
      render(snapshot);
    } catch (err) {
      console.error("SpeedMeter tick failed:", err);
    }
  }

  function collectMetrics() {
    let usedHeapBytes = null;

    try {
      if (
        performance.memory &&
        Number.isFinite(performance.memory.usedJSHeapSize)
      ) {
        usedHeapBytes = performance.memory.usedJSHeapSize;
      }
    } catch (_) {}

    return {
      title: document.title || location.hostname,
      faviconUrl: getFaviconUrl(),
      url: location.href,
      usedHeapBytes,
      domNodes: document.getElementsByTagName("*").length
    };
  }

  function getFaviconUrl() {
    const icon =
      document.querySelector('link[rel~="icon"]') ||
      document.querySelector('link[rel="shortcut icon"]');

    if (icon?.href) return icon.href;

    try {
      return new URL("/favicon.ico", location.origin).href;
    } catch (_) {
      return "";
    }
  }

  function getDefaultPosition() {
    return {
      x: Math.max(12, window.innerWidth - 176 - 12),
      y: 12
    };
  }

  function clampPosition() {
    if (!state.position) state.position = getDefaultPosition();

    const width = state.settings.collapsed ? 176 : 286;
    const height = state.settings.collapsed ? 110 : 540;

    state.position.x = Math.min(
      Math.max(8, state.position.x),
      Math.max(8, window.innerWidth - width - 8)
    );

    state.position.y = Math.min(
      Math.max(8, state.position.y),
      Math.max(8, window.innerHeight - Math.min(height, window.innerHeight - 8))
    );
  }

  function applyPosition() {
    if (!state.position) state.position = getDefaultPosition();
    clampPosition();

    state.refs.container.style.left = `${state.position.x}px`;
    state.refs.container.style.top = `${state.position.y}px`;
  }

  function applySettings() {
    const c = state.refs.container;
    c.classList.remove("theme-dark", "theme-light", "theme-ocean");
    c.classList.add(`theme-${state.settings.theme || "dark"}`);
    c.classList.toggle("hidden", !state.settings.overlayVisible);
    c.classList.toggle("compact", !!state.settings.collapsed);
    c.style.setProperty(
      "--panel-opacity",
      String(
        Math.min(100, Math.max(20, Number(state.settings.opacity) || 85)) / 100
      )
    );

    state.refs.collapseBtn.textContent = state.settings.collapsed ? "▸" : "▾";
    applyPosition();
  }

  function render(snapshot) {
    if (!snapshot || !state.refs) return;

    const collapsed = !!state.settings.collapsed;
    const topTab = snapshot.tabs?.[0];
    const exactFile = snapshot.activeDownloads?.[0];

    state.refs.titleText.textContent = collapsed ? "SM" : "SpeedMeter";

    if (collapsed) {
      state.refs.meta.textContent =
        `${snapshot.tabCount} tabs • ${topTab?.memoryMB ? `top ${formatMB(topTab.memoryMB)}` : "live"}`;
      state.refs.downRate.textContent = `↓ ${formatRate(snapshot.speeds.downloadBps)}`;
      state.refs.upRate.textContent = `↑ ${formatRate(snapshot.speeds.uploadBps)}`;
    } else {
      state.refs.meta.textContent = `Precision mode • all tabs aggregate`;
      state.refs.downRate.textContent = formatRate(snapshot.speeds.downloadBps);
      state.refs.upRate.textContent = formatRate(snapshot.speeds.uploadBps);
    }

    state.refs.downNote.textContent =
      `Live all tabs + exact file downloads (${formatRate(snapshot.speeds.exactDownloadBps)} file downloads)`;
    state.refs.upNote.textContent = `Live all tabs`;

    if (collapsed) {
      if (exactFile && exactFile.speedBps > 0) {
        state.refs.miniStrip.innerHTML =
          `<div class="mini-strip-inner">File ↓ ${formatRate(exactFile.speedBps)} exact</div>`;
      } else if (topTab) {
        state.refs.miniStrip.innerHTML =
          `<div class="mini-strip-inner">${escapeHtml(getHost(topTab.url))} • ↓ ${formatRate(topTab.downBps || 0)}</div>`;
      } else {
        state.refs.miniStrip.innerHTML =
          `<div class="mini-strip-inner">Live all-tab traffic</div>`;
      }
    } else {
      state.refs.miniStrip.innerHTML = "";
    }

    state.refs.downloadsSection.style.display =
      !collapsed && state.settings.metrics.bandwidth ? "" : "none";

    state.refs.totalsSection.style.display =
      !collapsed && state.settings.metrics.totals ? "" : "none";

    state.refs.historySection.style.display =
      !collapsed && state.settings.metrics.history ? "" : "none";

    state.refs.tabsSection.style.display =
      !collapsed && state.settings.metrics.tabs ? "" : "none";

    state.refs.downloadsList.innerHTML = buildDownloadsHTML(snapshot.activeDownloads);
    state.refs.tabsList.innerHTML = buildTabsHTML(snapshot.tabs);
    state.refs.totalsGrid.innerHTML = buildTotalsHTML(snapshot);

    const accent =
      getComputedStyle(state.refs.container).getPropertyValue("--accent").trim() ||
      "#38bdf8";

    if (!collapsed && state.settings.metrics.history) {
      drawSparkline(state.refs.downCanvas, snapshot.history.download, accent);
      drawSparkline(state.refs.upCanvas, snapshot.history.upload, accent);
      drawSparkline(state.refs.memCanvas, snapshot.history.memory, accent);
    }
  }

  function buildDownloadsHTML(downloads) {
    if (!downloads?.length) {
      return `<div class="empty">No active file downloads</div>`;
    }

    return downloads
      .map((d) => {
        const progress = d.totalBytes
          ? `${formatBytes(d.bytesReceived)} / ${formatBytes(d.totalBytes)}`
          : formatBytes(d.bytesReceived);

        return `
          <div class="row">
            <div class="rank">↓</div>
            <div class="fav"></div>
            <div class="main">
              <div class="file-line">${escapeHtml(d.filename || "Download")}</div>
              <div class="detail-line">Exact file download • ${progress}</div>
            </div>
            <div class="mem">${formatRate(d.speedBps)}</div>
          </div>
        `;
      })
      .join("");
  }

  function buildTabsHTML(tabs) {
    if (!tabs?.length) {
      return `<div class="empty">No monitored tabs yet</div>`;
    }

    return tabs
      .map((tab, index) => {
        const host = getHost(tab.url);
        const approx = tab.memorySource === "estimate" ? "~" : "";
        const favicon = escapeHtml(tab.faviconUrl || "");

        return `
          <div class="row ${index === 0 ? "top" : ""}" data-tab-id="${tab.tabId}">
            <div class="rank">${index + 1}</div>
            <img class="fav" src="${favicon}" alt="" />
            <div class="main">
              <div class="title-line">${escapeHtml(tab.title || "Untitled")}</div>
              <div class="host-line">${escapeHtml(host)} • ↓ ${formatRate(tab.downBps || 0)} • ↑ ${formatRate(tab.upBps || 0)}</div>
            </div>
            <div class="mem">${approx}${formatMB(tab.memoryMB)}</div>
          </div>
        `;
      })
      .join("");
  }

  function buildTotalsHTML(snapshot) {
    return `
      <div class="stat">
        <div class="k">Open tabs</div>
        <div class="v">${snapshot.tabCount}</div>
      </div>
      <div class="stat">
        <div class="k">Total memory</div>
        <div class="v">${formatMB(snapshot.totalEstimatedMemoryMB)}</div>
      </div>
      <div class="stat">
        <div class="k">Session ↓</div>
        <div class="v">${formatBytes(snapshot.totals.downloadBytes)}</div>
      </div>
      <div class="stat">
        <div class="k">Session ↑</div>
        <div class="v">${formatBytes(snapshot.totals.uploadBytes)}</div>
      </div>
    `;
  }

  function drawSparkline(canvas, values, color) {
    const ctx = canvas.getContext("2d");
    const width = Math.max(10, canvas.clientWidth);
    const height = Math.max(10, canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 4);
    ctx.lineTo(width, height - 4);
    ctx.stroke();

    if (!values?.length) return;

    const max = Math.max(1, ...values);
    const step = values.length > 1 ? width / (values.length - 1) : width;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    values.forEach((value, index) => {
      const x = index * step;
      const y = height - 4 - ((value || 0) / max) * (height - 8);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  }

  function formatRate(bytesPerSecond) {
    const kb = (bytesPerSecond || 0) / 1024;
    if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB/s`;
    return `${kb < 10 ? kb.toFixed(1) : kb.toFixed(0)} KB/s`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }

  function formatMB(mb) {
    if (!Number.isFinite(mb)) return "N/A";
    return `${mb.toFixed(1)} MB`;
  }

  function getHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (_) {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();