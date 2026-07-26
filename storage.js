(function () {
  "use strict";

  const STORAGE_KEY = "linkMemoData";
  const GROUP_COLORS = [
    "blue",
    "lightblue",
    "purple",
    "green",
    "yellow",
    "orange",
    "pink",
    "black"
  ];

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

  function normalizeUrl(value) {
    const input = String(value || "").trim();
    if (!input) return "";

    const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(input)
      ? input
      : `https://${input}`;

    try {
      const url = new URL(withProtocol);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function normalizeData(raw) {
    if (!raw || !Array.isArray(raw.groups)) return clone(DEFAULT_DATA);

    const groups = raw.groups
      .filter((group) => group && typeof group === "object")
      .map((group) => ({
        id: String(group.id || createId("group")),
        name: String(group.name || "名称未設定").slice(0, 60),
        emoji: String(group.emoji || "📌").slice(0, 8),
        color: GROUP_COLORS.includes(group.color)
          ? group.color
          : "blue",
        collapsed: Boolean(group.collapsed),
        bookmarks: Array.isArray(group.bookmarks)
          ? group.bookmarks
              .map((bookmark) => {
                const url = normalizeUrl(bookmark && bookmark.url);
                if (!url) return null;
                return {
                  id: String(bookmark.id || createId("bookmark")),
                  title: String(bookmark.title || new URL(url).hostname).slice(0, 160),
                  url
                };
              })
              .filter(Boolean)
          : []
      }));

    return {
      version: 1,
      groups: groups.length ? groups : clone(DEFAULT_DATA.groups)
    };
  }

  async function load() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeData(stored[STORAGE_KEY]);
  }

  async function save(data) {
    const normalized = normalizeData(data);
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  function getAllBookmarks(data) {
    return data.groups.flatMap((group) => group.bookmarks);
  }

  globalThis.LinkMemoStore = {
    STORAGE_KEY,
    DEFAULT_DATA,
    clone,
    createId,
    normalizeUrl,
    normalizeData,
    load,
    save,
    getAllBookmarks
  };
})();
