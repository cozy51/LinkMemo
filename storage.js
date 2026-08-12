(function () {
  "use strict";

  const STORAGE_KEY = "linkMemoData";
  // When the stored data last changed.  An import is judged against it, so a
  // file exported before the current data was edited can be recognised as old.
  const UPDATED_AT_KEY = "linkMemoDataUpdatedAt";
  // Declared by sync-core.js, which every page loads first.  `const` at the top
  // level of a classic script is not a property of the global object, so these
  // are reached by name rather than through `globalThis`.
  const GROUP_COLORS = LINK_MEMO_GROUP_COLORS;

  const DEFAULT_DATA = {
    version: 1,
    groups: [
      {
        id: "group-morning",
        name: "毎朝開く",
        emoji: "☀️",
        color: "blue",
        collapsed: false,
        bookmarks: []
      }
    ]
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // Normalization itself lives in sync-core.js, so the editor, the popup, and
  // the cloud sync all judge the same data the same way.  What is added here is
  // the shape the pages expect: a versioned object that always has a group to
  // put links in.
  function normalizeData(raw) {
    const { groups } = normalizeLinkMemoDataset(raw);
    return {
      version: 1,
      groups: groups.length ? groups : clone(DEFAULT_DATA.groups)
    };
  }

  async function load() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeData(stored[STORAGE_KEY]);
  }

  async function loadUpdatedAt() {
    const stored = await chrome.storage.local.get(UPDATED_AT_KEY);
    return String(stored[UPDATED_AT_KEY] || "");
  }

  // `origin: "cloud"` marks a copy that came *from* the cloud: it must not be
  // pushed straight back, and its stamp is the moment the cloud copy was
  // written rather than now, so a later import is compared against when the
  // data actually changed.
  async function save(data, { updatedAt = "", origin = "local" } = {}) {
    const normalized = normalizeData(data);
    await chrome.storage.local.set({
      [STORAGE_KEY]: normalized,
      [UPDATED_AT_KEY]: updatedAt || new Date().toISOString()
    });
    if (origin !== "cloud") globalThis.linkMemoCloudSync?.notifyLocalChange();
    return normalized;
  }

  function getAllBookmarks(data) {
    return data.groups.flatMap((group) => group.bookmarks);
  }

  globalThis.LinkMemoStore = {
    STORAGE_KEY,
    UPDATED_AT_KEY,
    DEFAULT_DATA,
    GROUP_COLORS,
    clone,
    createId,
    normalizeUrl: normalizeLinkMemoUrl,
    normalizeData,
    load,
    loadUpdatedAt,
    save,
    getAllBookmarks
  };
})();
