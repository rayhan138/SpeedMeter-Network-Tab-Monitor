const DEFAULT_SETTINGS = {
  overlayVisible: true,
  collapsed: false,
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

const refs = {
  overlayVisible: document.getElementById("overlayVisible"),
  opacity: document.getElementById("opacity"),
  opacityValue: document.getElementById("opacityValue"),
  theme: document.getElementById("theme"),
  tabsToShow: document.getElementById("tabsToShow"),
  memoryThresholdMB: document.getElementById("memoryThresholdMB"),
  metricBandwidth: document.getElementById("metricBandwidth"),
  metricTabs: document.getElementById("metricTabs"),
  metricTotals: document.getElementById("metricTotals"),
  metricHistory: document.getElementById("metricHistory"),
  saveBtn: document.getElementById("saveBtn"),
  resetBtn: document.getElementById("resetBtn"),
  shortcutsBtn: document.getElementById("shortcutsBtn"),
  status: document.getElementById("status")
};

load();

refs.opacity.addEventListener("input", () => {
  refs.opacityValue.textContent = `${refs.opacity.value}%`;
});

refs.saveBtn.addEventListener("click", save);
refs.resetBtn.addEventListener("click", resetDefaults);

refs.shortcutsBtn.addEventListener("click", async () => {
  try {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  } catch (err) {
    refs.status.textContent = "Open chrome://extensions/shortcuts manually.";
  }
});

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    metrics: {
      ...DEFAULT_SETTINGS.metrics,
      ...(stored.metrics || {})
    }
  };

  refs.overlayVisible.checked = !!settings.overlayVisible;
  refs.opacity.value = settings.opacity;
  refs.opacityValue.textContent = `${settings.opacity}%`;
  refs.theme.value = settings.theme;
  refs.tabsToShow.value = String(settings.tabsToShow);
  refs.memoryThresholdMB.value = settings.memoryThresholdMB;

  refs.metricBandwidth.checked = !!settings.metrics.bandwidth;
  refs.metricTabs.checked = !!settings.metrics.tabs;
  refs.metricTotals.checked = !!settings.metrics.totals;
  refs.metricHistory.checked = !!settings.metrics.history;
}

async function save() {
  const settings = {
    overlayVisible: refs.overlayVisible.checked,
    opacity: clamp(Number(refs.opacity.value), 20, 100),
    theme: refs.theme.value,
    tabsToShow: clamp(Number(refs.tabsToShow.value), 5, 10),
    memoryThresholdMB: Math.max(50, Number(refs.memoryThresholdMB.value) || 500),
    metrics: {
      bandwidth: refs.metricBandwidth.checked,
      tabs: refs.metricTabs.checked,
      totals: refs.metricTotals.checked,
      history: refs.metricHistory.checked
    }
  };

  await chrome.storage.sync.set(settings);
  refs.status.textContent = "Saved.";
  setTimeout(() => {
    refs.status.textContent = "";
  }, 1500);
}

async function resetDefaults() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  await load();
  refs.status.textContent = "Defaults restored.";
  setTimeout(() => {
    refs.status.textContent = "";
  }, 1500);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}