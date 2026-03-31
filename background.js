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

const DEBUGGER_VERSION = "1.3";
const WELCOME_PAGE_URL = "https://speedmeter.blinkeye.app";

const ICON_DATA_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
      <rect width="128" height="128" rx="24" fill="#0ea5e9"/>
      <text x="64" y="78" font-size="64" text-anchor="middle" fill="white" font-family="Arial, sans-serif">S</text>
    </svg>
  `);

const encoder = new TextEncoder();
const BUCKET_MS = 250;
const NET_KEEP_MS = 15000;

const state = {
  settings: normalizeSettings(DEFAULT_SETTINGS),
  tabs: new Map(),
  downloads: new Map(),
  debuggerTabs: new Map(),
  recentNetBuckets: new Map(),
  pageUploadRequests: new Map(),
  history: {
    download: [],
    upload: [],
    memory: []
  },
  sessionTotals: {
    pageDownloadBytes: 0,
    pageUploadBytes: 0,
    downloadManagerBytes: 0
  },
  tabCount: 0,
  lastHistoryAt: 0,
  lastDownloadsSyncAt: 0,
  lastDebuggerSweepAt: 0
};

let downloadSyncPromise = null;

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

function createTabEntry(tab = {}) {
  return {
    title: tab.title || "Untitled",
    faviconUrl: tab.favIconUrl || "",
    url: tab.url || "",
    memoryMB: null,
    memorySource: "na",
    usedHeapBytes: null,
    domNodes: 0,
    lastSeen: Date.now(),
    lastAlertAt: 0
  };
}

function resetSessionTotals() {
  state.sessionTotals.pageDownloadBytes = 0;
  state.sessionTotals.pageUploadBytes = 0;
  state.sessionTotals.downloadManagerBytes = 0;
}


async function init() {
  try {
    resetSessionTotals();
    
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    state.settings = normalizeSettings(stored);

    const tabs = await chrome.tabs.query({});
    state.tabCount = tabs.length;

    for (const tab of tabs) {
      if (tab.id != null) {
        state.tabs.set(tab.id, createTabEntry(tab));
      }
    }

    await ensureDebuggerSweep(true);
    await syncActiveDownloads(true);
  } catch (err) {
    console.error("SpeedMeter init failed:", err);
  }
}

init();

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const existing = await chrome.storage.sync.get(null);
    const merged = normalizeSettings(existing);
    await chrome.storage.sync.set(merged);
    state.settings = merged;
  } catch (err) {
    console.error("onInstalled failed:", err);
  }

  // Open welcome page on first install
  if (details.reason === "install") {
    try {
      await chrome.tabs.create({ url: WELCOME_PAGE_URL });
    } catch (err) {
      console.error("Failed to open welcome page:", err);
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  resetSessionTotals();
  init();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  const patch = {};
  for (const [key, value] of Object.entries(changes)) {
    patch[key] = value.newValue;
  }

  state.settings = normalizeSettings({
    ...state.settings,
    ...patch
  });

  broadcast({
    type: "settingsChanged",
    settings: state.settings
  }).catch(() => {});
});

chrome.tabs.onCreated.addListener((tab) => {
  state.tabCount += 1;

  if (tab.id != null) {
    state.tabs.set(tab.id, createTabEntry(tab));
    ensureDebuggerAttached(tab.id, tab.url).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  state.tabCount = Math.max(0, state.tabCount - 1);
  state.tabs.delete(tabId);
  state.debuggerTabs.delete(tabId);

  for (const [key, bucket] of state.recentNetBuckets.entries()) {
    if (bucket.tabId === tabId) state.recentNetBuckets.delete(key);
  }

  for (const [key] of state.pageUploadRequests.entries()) {
    if (key.startsWith(`${tabId}|`)) state.pageUploadRequests.delete(key);
  }

  maybeUpdateHistory();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const existing = state.tabs.get(tabId) || createTabEntry(tab);

  state.tabs.set(tabId, {
    ...existing,
    title: changeInfo.title || tab.title || existing.title || "Untitled",
    faviconUrl: changeInfo.favIconUrl || tab.favIconUrl || existing.faviconUrl || "",
    url: changeInfo.url || tab.url || existing.url || ""
  });

  const nextUrl = changeInfo.url || tab.url;
  if (isSupportedTabUrl(nextUrl)) {
    ensureDebuggerAttached(tabId, nextUrl).catch(() => {});
  } else {
    detachDebugger(tabId).catch(() => {});
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source?.tabId;
  if (tabId == null) return;
  state.debuggerTabs.delete(tabId);
  console.warn(`SpeedMeter debugger detached from tab ${tabId}: ${reason}`);
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source?.tabId;
  if (tabId == null) return;

  let tabDebug = state.debuggerTabs.get(tabId);
  if (!tabDebug) {
    tabDebug = { attached: true, attaching: false, requests: new Map() };
    state.debuggerTabs.set(tabId, tabDebug);
  }

  try {
    switch (method) {
      case "Network.requestWillBeSent": {
        const requestId = params.requestId;

        if (params.redirectResponse) {
          tabDebug.requests.delete(requestId);
        }

        if (!tabDebug.requests.has(requestId)) {
          tabDebug.requests.set(requestId, { rxCounted: 0 });
        }
        break;
      }

      case "Network.dataReceived": {
        const requestId = params.requestId;
        const rxBytes = Math.max(
          0,
          Number(params.encodedDataLength) || Number(params.dataLength) || 0
        );

        let req = tabDebug.requests.get(requestId);
        if (!req) req = { rxCounted: 0 };

        req.rxCounted += rxBytes;
        tabDebug.requests.set(requestId, req);

        if (rxBytes > 0) {
          recordNetBytes(tabId, rxBytes, 0);
        }
        break;
      }

      case "Network.loadingFinished": {
        const requestId = params.requestId;
        const totalEncoded = Math.max(0, Number(params.encodedDataLength) || 0);
        const req = tabDebug.requests.get(requestId);

        if (req) {
          const missing = Math.max(0, totalEncoded - (req.rxCounted || 0));
          if (missing > 0) {
            recordNetBytes(tabId, missing, 0);
          }
          tabDebug.requests.delete(requestId);
        }
        break;
      }

      case "Network.loadingFailed": {
        tabDebug.requests.delete(params.requestId);
        break;
      }

      case "Network.webSocketFrameReceived": {
        const payload = params.response?.payloadData || "";
        const rxBytes = utf8Bytes(payload);
        if (rxBytes > 0) {
          recordNetBytes(tabId, rxBytes, 0);
        }
        break;
      }

      case "Network.webSocketFrameSent": {
        const payload = params.response?.payloadData || "";
        const txBytes = utf8Bytes(payload);
        if (txBytes > 0) {
          recordNetBytes(tabId, 0, txBytes);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Debugger event handling failed:", method, err);
  }
});

function utf8Bytes(value) {
  try {
    return encoder.encode(String(value || "")).length;
  } catch (_) {
    return 0;
  }
}

function isSupportedTabUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function dbgAttach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, DEBUGGER_VERSION, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function dbgDetach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function dbgSend(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

async function ensureDebuggerAttached(tabId, url) {
  if (!isSupportedTabUrl(url)) return;

  const existing = state.debuggerTabs.get(tabId);
  if (existing?.attached || existing?.attaching) return;

  state.debuggerTabs.set(tabId, {
    attached: false,
    attaching: true,
    requests: new Map()
  });

  try {
    await dbgAttach({ tabId });
    await dbgSend({ tabId }, "Network.enable", {
      maxTotalBufferSize: 8 * 1024 * 1024,
      maxResourceBufferSize: 1024 * 1024,
      maxPostDataSize: 512 * 1024
    });

    state.debuggerTabs.set(tabId, {
      attached: true,
      attaching: false,
      requests: new Map()
    });
  } catch (err) {
    state.debuggerTabs.delete(tabId);

    const message = String(err?.message || err || "");
    if (
      !message.includes("Another debugger is already attached") &&
      !message.includes("Cannot access") &&
      !message.includes("No tab with id")
    ) {
      console.error(`Failed to attach debugger to tab ${tabId}:`, err);
    }
  }
}

async function detachDebugger(tabId) {
  const existing = state.debuggerTabs.get(tabId);
  if (!existing) return;

  state.debuggerTabs.delete(tabId);

  try {
    await dbgDetach({ tabId });
  } catch (err) {
    const message = String(err?.message || err || "");
    if (
      !message.includes("Detached while handling command") &&
      !message.includes("No target with given id") &&
      !message.includes("No tab with id")
    ) {
      console.error(`Failed to detach debugger from tab ${tabId}:`, err);
    }
  }
}

async function ensureDebuggerSweep(force = false) {
  const now = Date.now();
  if (!force && now - state.lastDebuggerSweepAt < 10000) return;

  state.lastDebuggerSweepAt = now;

  try {
    const tabs = await chrome.tabs.query({});
    state.tabCount = tabs.length;

    for (const tab of tabs) {
      if (tab.id == null) continue;

      const existing = state.tabs.get(tab.id) || createTabEntry(tab);
      state.tabs.set(tab.id, {
        ...existing,
        title: tab.title || existing.title || "Untitled",
        faviconUrl: tab.favIconUrl || existing.faviconUrl || "",
        url: tab.url || existing.url || ""
      });

      if (isSupportedTabUrl(tab.url)) {
        ensureDebuggerAttached(tab.id, tab.url).catch(() => {});
      }
    }
  } catch (err) {
    console.error("ensureDebuggerSweep failed:", err);
  }
}

function cleanupNetBuckets(now = Date.now()) {
  for (const [key, bucket] of state.recentNetBuckets.entries()) {
    if (now - bucket.ts > NET_KEEP_MS) {
      state.recentNetBuckets.delete(key);
    }
  }
}

function addBucketBytes(tabId, rxBytes = 0, txBytes = 0, atTs = Date.now()) {
  const bucketTs = atTs - (atTs % BUCKET_MS);
  const key = `${tabId}|${bucketTs}`;

  let bucket = state.recentNetBuckets.get(key);
  if (!bucket) {
    bucket = { ts: bucketTs, tabId, rx: 0, tx: 0 };
    state.recentNetBuckets.set(key, bucket);
  }

  bucket.rx += rxBytes;
  bucket.tx += txBytes;

  cleanupNetBuckets(atTs);
}

function recordNetBytes(tabId, rxBytes = 0, txBytes = 0, atTs = Date.now()) {
  rxBytes = Math.max(0, Number(rxBytes) || 0);
  txBytes = Math.max(0, Number(txBytes) || 0);
  if (!rxBytes && !txBytes) return;

  addBucketBytes(tabId, rxBytes, txBytes, atTs);
  state.sessionTotals.pageDownloadBytes += rxBytes;
  state.sessionTotals.pageUploadBytes += txBytes;
  maybeUpdateHistory();
}

function recordNetRange(tabId, rxBytes = 0, txBytes = 0, startTs = Date.now(), endTs = Date.now()) {
  rxBytes = Math.max(0, Number(rxBytes) || 0);
  txBytes = Math.max(0, Number(txBytes) || 0);
  if (!rxBytes && !txBytes) return;

  const safeStart = Number.isFinite(startTs) ? startTs : Date.now();
  const safeEnd = Math.max(safeStart, Number.isFinite(endTs) ? endTs : safeStart);

  const firstBucket = Math.floor(safeStart / BUCKET_MS) * BUCKET_MS;
  const lastBucket = Math.floor(safeEnd / BUCKET_MS) * BUCKET_MS;
  const bucketCount = Math.max(1, Math.floor((lastBucket - firstBucket) / BUCKET_MS) + 1);

  const rxPerBucket = rxBytes / bucketCount;
  const txPerBucket = txBytes / bucketCount;

  for (let i = 0; i < bucketCount; i += 1) {
    const ts = firstBucket + i * BUCKET_MS;
    addBucketBytes(tabId, rxPerBucket, txPerBucket, ts);
  }

  state.sessionTotals.pageDownloadBytes += rxBytes;
  state.sessionTotals.pageUploadBytes += txBytes;
  maybeUpdateHistory();
}

function getRecentNetBps(windowMs = 1000) {
  cleanupNetBuckets();
  const now = Date.now();
  let rx = 0;
  let tx = 0;

  for (const bucket of state.recentNetBuckets.values()) {
    if (now - bucket.ts <= windowMs) {
      rx += bucket.rx;
      tx += bucket.tx;
    }
  }

  return {
    downloadBps: (rx * 1000) / windowMs,
    uploadBps: (tx * 1000) / windowMs
  };
}

function getTabNetBps(tabId, windowMs = 1000) {
  cleanupNetBuckets();
  const now = Date.now();
  let rx = 0;
  let tx = 0;

  for (const bucket of state.recentNetBuckets.values()) {
    if (bucket.tabId === tabId && now - bucket.ts <= windowMs) {
      rx += bucket.rx;
      tx += bucket.tx;
    }
  }

  return {
    downBps: (rx * 1000) / windowMs,
    upBps: (tx * 1000) / windowMs
  };
}

function pageUploadKey(tabId, requestId) {
  return `${tabId}|${requestId}`;
}

function handleUploadProgressBatch(sender, events = []) {
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  for (const event of events) {
    const requestId = event?.requestId || `anon-${Date.now()}`;
    const key = pageUploadKey(tabId, requestId);

    const req = state.pageUploadRequests.get(key) || {
      kind: "xhr",
      startTs: Number(event?.ts) || Date.now(),
      estimatedBytes: Math.max(0, Number(event?.totalBytes) || 0),
      accountedBytes: 0,
      sawProgress: false
    };

    const deltaBytes = Math.max(0, Number(event?.deltaBytes) || 0);
    const totalBytes = Math.max(0, Number(event?.totalBytes) || 0);
    const ts = Number(event?.ts) || Date.now();

    if (totalBytes > 0) {
      req.estimatedBytes = Math.max(req.estimatedBytes || 0, totalBytes);
    }

    if (deltaBytes > 0) {
      req.accountedBytes += deltaBytes;
      req.sawProgress = true;
      recordNetBytes(tabId, 0, deltaBytes, ts);
    }

    state.pageUploadRequests.set(key, req);
  }
}

function handleUploadLifecycle(sender, payload = {}) {
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  const kind = payload.kind;
  const ts = Number(payload.ts) || Date.now();

  if (kind === "beacon" || kind === "form-submit") {
    const bytes = Math.max(0, Number(payload.bytes) || 0);
    if (bytes > 0) {
      recordNetRange(tabId, 0, bytes, ts - 300, ts);
    }
    return;
  }

  const requestId = payload.requestId;
  if (!requestId) return;

  const key = pageUploadKey(tabId, requestId);

  switch (kind) {
    case "xhr-start": {
      state.pageUploadRequests.set(key, {
        kind: "xhr",
        startTs: ts,
        estimatedBytes: Math.max(0, Number(payload.estimatedBytes) || 0),
        accountedBytes: 0,
        sawProgress: false
      });
      break;
    }

    case "xhr-end": {
      const req = state.pageUploadRequests.get(key) || {
        kind: "xhr",
        startTs: ts,
        estimatedBytes: Math.max(0, Number(payload.estimatedBytes) || 0),
        accountedBytes: 0,
        sawProgress: false
      };

      const loaded = Math.max(0, Number(payload.loaded) || 0);

      if (req.sawProgress) {
        const missing = Math.max(0, loaded - (req.accountedBytes || 0));
        if (missing > 0) {
          recordNetBytes(tabId, 0, missing, ts);
        }
      } else {
        const total = Math.max(req.estimatedBytes || 0, loaded);
        if (total > 0) {
          recordNetRange(tabId, 0, total, req.startTs || ts, ts);
        }
      }

      state.pageUploadRequests.delete(key);
      break;
    }

    case "fetch-start": {
      state.pageUploadRequests.set(key, {
        kind: "fetch",
        startTs: ts,
        estimatedBytes: Math.max(0, Number(payload.estimatedBytes) || 0),
        accountedBytes: 0,
        sawProgress: false
      });
      break;
    }

    case "fetch-end": {
      const req = state.pageUploadRequests.get(key) || {
        kind: "fetch",
        startTs: ts,
        estimatedBytes: Math.max(0, Number(payload.estimatedBytes) || 0)
      };

      const total = Math.max(0, Number(payload.estimatedBytes) || req.estimatedBytes || 0);
      if (total > 0) {
        recordNetRange(tabId, 0, total, req.startTs || ts, ts);
      }

      state.pageUploadRequests.delete(key);
      break;
    }

    default:
      break;
  }
}

async function syncActiveDownloads(force = false) {
  const now = Date.now();

  if (!force && now - state.lastDownloadsSyncAt < 800) {
    return;
  }

  if (downloadSyncPromise) {
    return downloadSyncPromise;
  }

  downloadSyncPromise = (async () => {
    try {
      const sampleTs = Date.now();
      let items = await chrome.downloads.search({ state: "in_progress" });
      items = items || [];

      const seenIds = new Set();

      for (const item of items) {
        seenIds.add(item.id);

        const prev = state.downloads.get(item.id);
        let speedBps = prev?.speedBps || 0;

        const bytesReceived = item.bytesReceived || 0;
        const totalBytes = item.totalBytes > 0 ? item.totalBytes : null;

        if (prev && Number.isFinite(prev.bytesReceived)) {
          const deltaBytes = Math.max(0, bytesReceived - (prev.bytesReceived || 0));
          const elapsedMs = Math.max(250, sampleTs - (prev.sampleTs || sampleTs));

          speedBps = (deltaBytes * 1000) / elapsedMs;

          if (deltaBytes > 0) {
            state.sessionTotals.downloadManagerBytes += deltaBytes;
          }
        }

        state.downloads.set(item.id, {
          id: item.id,
          filename: getFileName(item.filename || prev?.filename || "Download"),
          totalBytes,
          bytesReceived,
          speedBps,
          state: "in_progress",
          sampleTs
        });
      }

      for (const [id, entry] of state.downloads.entries()) {
        if (seenIds.has(id)) continue;

        if (entry.state === "in_progress") {
          entry.state = "complete";
          entry.speedBps = 0;
          entry.finishedTs = sampleTs;
          state.downloads.set(id, entry);
        }

        if (
          entry.state !== "in_progress" &&
          sampleTs - (entry.finishedTs || sampleTs) > 15000
        ) {
          state.downloads.delete(id);
        }
      }

      state.lastDownloadsSyncAt = sampleTs;
    } catch (err) {
      console.error("syncActiveDownloads failed:", err);
    }
  })().finally(() => {
    downloadSyncPromise = null;
  });

  return downloadSyncPromise;
}

chrome.downloads.onCreated.addListener(() => {
  syncActiveDownloads(true).catch((err) => {
    console.error("downloads.onCreated sync failed:", err);
  });
});

chrome.downloads.onChanged.addListener(() => {
  syncActiveDownloads(true).catch((err) => {
    console.error("downloads.onChanged sync failed:", err);
  });
});

function updateTabMetrics(sender, metrics = {}) {
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  const prev = state.tabs.get(tabId) || {};
  const usedHeapBytes = Number.isFinite(metrics.usedHeapBytes)
    ? metrics.usedHeapBytes
    : null;
  const domNodes = Number.isFinite(metrics.domNodes) ? metrics.domNodes : 0;

  let memoryMB = null;
  let memorySource = "na";

  if (usedHeapBytes !== null) {
    memoryMB = usedHeapBytes / 1048576;
    memorySource = "heap";
  } else if (domNodes > 0) {
    memoryMB = Math.max(1, domNodes * 0.015);
    memorySource = "estimate";
  }

  const entry = {
    title: metrics.title || sender.tab?.title || prev.title || "Untitled",
    faviconUrl:
      metrics.faviconUrl || sender.tab?.favIconUrl || prev.faviconUrl || "",
    url: metrics.url || sender.tab?.url || prev.url || "",
    memoryMB,
    memorySource,
    usedHeapBytes,
    domNodes,
    lastSeen: Date.now(),
    lastAlertAt: prev.lastAlertAt || 0
  };

  state.tabs.set(tabId, entry);
  maybeNotifyMemory(entry, tabId);
  maybeUpdateHistory();
}

function maybeNotifyMemory(entry, tabId) {
  const threshold = Number(state.settings.memoryThresholdMB) || 500;
  if (!Number.isFinite(entry.memoryMB) || entry.memoryMB <= threshold) return;

  const now = Date.now();
  if (now - (entry.lastAlertAt || 0) < 5 * 60 * 1000) return;

  entry.lastAlertAt = now;
  state.tabs.set(tabId, entry);

  chrome.notifications.create(
    `speedmeter-${tabId}-${now}`,
    {
      type: "basic",
      iconUrl: ICON_DATA_URL,
      title: "SpeedMeter memory alert",
      message: `${entry.title} is using ${entry.memoryMB.toFixed(1)} MB${
        entry.memorySource !== "heap" ? " (estimated)" : ""
      }.`
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
      }
    }
  );
}

function getFileName(path = "") {
  return path.split("/").pop()?.split("\\").pop() || "Download";
}

function getActiveDownloads() {
  return [...state.downloads.values()]
    .filter((d) => d.state === "in_progress")
    .sort((a, b) => (b.speedBps || 0) - (a.speedBps || 0))
    .slice(0, 3);
}

function getExactDownloadManagerBps() {
  return getActiveDownloads().reduce((sum, d) => sum + (d.speedBps || 0), 0);
}

function getTotalEstimatedMemoryMB() {
  let total = 0;
  for (const tab of state.tabs.values()) {
    if (Number.isFinite(tab.memoryMB)) total += tab.memoryMB;
  }
  return total;
}

function getTopTabs() {
  return [...state.tabs.entries()]
    .map(([tabId, tab]) => {
      const net = getTabNetBps(tabId, 1000);
      return {
        tabId,
        ...tab,
        downBps: net.downBps,
        upBps: net.upBps
      };
    })
    .sort((a, b) => {
      const am = Number.isFinite(a.memoryMB) ? a.memoryMB : -1;
      const bm = Number.isFinite(b.memoryMB) ? b.memoryMB : -1;
      if (bm !== am) return bm - am;
      return (b.downBps || 0) - (a.downBps || 0);
    });
}

function pushHistory(name, value) {
  const arr = state.history[name];
  arr.push(Math.round(value || 0));
  while (arr.length > 60) arr.shift();
}

function maybeUpdateHistory() {
  const now = Date.now();
  if (now - state.lastHistoryAt < 5000) return;

  state.lastHistoryAt = now;
  const net = getRecentNetBps(1000);
  pushHistory("download", net.downloadBps + getExactDownloadManagerBps());
  pushHistory("upload", net.uploadBps);
  pushHistory("memory", getTotalEstimatedMemoryMB());
}

async function buildSnapshot() {
  await ensureDebuggerSweep();
  await syncActiveDownloads();

  const net = getRecentNetBps(1000);
  const exactDownloadBps = getExactDownloadManagerBps();

  return {
    settings: state.settings,
    speeds: {
      downloadBps: net.downloadBps + exactDownloadBps,
      uploadBps: net.uploadBps,
      exactDownloadBps
    },
    totals: {
      downloadBytes:
        state.sessionTotals.pageDownloadBytes + state.sessionTotals.downloadManagerBytes,
      uploadBytes: state.sessionTotals.pageUploadBytes
    },
    totalEstimatedMemoryMB: getTotalEstimatedMemoryMB(),
    tabCount: state.tabCount,
    tabs: getTopTabs(),
    activeDownloads: getActiveDownloads(),
    history: {
      download: [...state.history.download],
      upload: [...state.history.upload],
      memory: [...state.history.memory]
    }
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "reportTabMetrics":
          updateTabMetrics(sender, message.metrics || {});
          sendResponse(await buildSnapshot());
          break;

        case "getSnapshot":
          sendResponse(await buildSnapshot());
          break;

        case "uploadProgressBatch":
          handleUploadProgressBatch(sender, message.events || []);
          sendResponse({ ok: true });
          break;

        case "uploadLifecycle":
          handleUploadLifecycle(sender, message.payload || {});
          sendResponse({ ok: true });
          break;

        case "closeTab":
          if (Number.isInteger(message.tabId)) {
            await chrome.tabs.remove(message.tabId);
          }
          sendResponse({ ok: true });
          break;

        case "reloadTab":
          if (Number.isInteger(message.tabId)) {
            await chrome.tabs.reload(message.tabId);
          }
          sendResponse({ ok: true });
          break;

        case "activateTab":
          if (Number.isInteger(message.tabId)) {
            const tab = await chrome.tabs.get(message.tabId).catch(() => null);
            if (tab) {
              await chrome.tabs.update(message.tabId, { active: true });
              if (tab.windowId != null) {
                await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
              }
            }
          }
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (err) {
      console.error("Message handler error:", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true;
});

async function broadcast(message) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.map((tab) => {
      if (tab.id == null) return Promise.resolve();
      return chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    })
  );
}

async function toggleOverlay() {
  const next = !state.settings.overlayVisible;
  state.settings.overlayVisible = next;
  await chrome.storage.sync.set({ overlayVisible: next });
  await broadcast({ type: "overlayVisibility", visible: next });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-overlay") {
    toggleOverlay().catch((err) => console.error("toggleOverlay failed:", err));
  }
});

chrome.action.onClicked.addListener(() => {
  toggleOverlay().catch((err) => console.error("action click failed:", err));
});