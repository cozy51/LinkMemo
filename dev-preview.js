(function () {
  "use strict";

  if (globalThis.chrome?.storage?.local && globalThis.chrome?.tabs) return;

  const previewStorage = {
    linkMemoData: {
      version: 1,
      groups: [
      {
        id: "preview-morning",
        name: "毎朝開く",
        emoji: "☀️",
        color: "blue",
        collapsed: false,
        bookmarks: [
          { id: "preview-1", title: "Outlook", url: "https://outlook.office.com/" },
          { id: "preview-2", title: "Microsoft Teams", url: "https://teams.microsoft.com/" }
        ]
      },
      {
        id: "preview-project",
        name: "プロジェクト",
        emoji: "🚀",
        color: "purple",
        collapsed: false,
        bookmarks: [
          { id: "preview-3", title: "GitHub", url: "https://github.com/" },
          { id: "preview-4", title: "Notion", url: "https://www.notion.so/" }
        ]
      },
      {
        id: "preview-learning",
        name: "社内ポータル",
        emoji: "🎓",
        color: "green",
        collapsed: false,
        bookmarks: [
          { id: "preview-5", title: "Microsoft 365", url: "https://www.microsoft365.com/" }
        ]
      }
      ]
    }
  };
  const listeners = [];
  const mockChrome = globalThis.chrome || {};

  mockChrome.storage = {
    local: {
      async get(keys) {
        if (typeof keys === "string") {
          return { [keys]: previewStorage[keys] };
        }
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, previewStorage[key]]));
        }
        if (keys && typeof keys === "object") {
          return Object.fromEntries(
            Object.entries(keys).map(([key, fallback]) => [
              key,
              previewStorage[key] === undefined ? fallback : previewStorage[key]
            ])
          );
        }
        return { ...previewStorage };
      },
      async set(payload) {
        const changes = {};
        Object.entries(payload).forEach(([key, newValue]) => {
          changes[key] = { oldValue: previewStorage[key], newValue };
          previewStorage[key] = newValue;
        });
        listeners.forEach((listener) => listener(changes, "local"));
      }
    },
    onChanged: {
      addListener(listener) {
        listeners.push(listener);
      }
    }
  };
  mockChrome.tabs = {
    async query() {
      return [{ title: "LinkMemo プレビュー", url: "https://example.com/" }];
    },
    async create() {
      return { id: Date.now() };
    },
    async update() {
      return {};
    }
  };
  mockChrome.runtime = {
    openOptionsPage() {
      globalThis.location.href = "options.html";
    }
  };
  globalThis.chrome = mockChrome;
})();
