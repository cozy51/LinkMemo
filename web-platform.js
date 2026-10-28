// LinkMemo now runs as a plain web page (deployed on Vercel) instead of a
// browser extension.  The rest of the code was written against the small part
// of the extension API it needs — chrome.storage.local, chrome.tabs.create and
// the manifest version — so this file provides exactly that part on top of the
// page's localStorage and window.open.  Keeping the same shape means the sync
// engine and its tests did not have to change.
const LINK_MEMO_APP_VERSION = "2.0.0";

(function () {
  "use strict";

  // Every key is stored under this prefix so the app does not collide with
  // anything else served from the same origin (e.g. a local dev server).
  const PREFIX = "linkMemo:";
  const listeners = [];

  function read(key) {
    try {
      const raw = globalThis.localStorage.getItem(PREFIX + key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  function notify(changes) {
    if (!Object.keys(changes).length) return;
    listeners.forEach((listener) => listener(changes, "local"));
  }

  const local = {
    async get(keys) {
      if (typeof keys === "string") keys = [keys];
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys
          .map((key) => [key, read(key)])
          .filter(([, value]) => value !== undefined));
      }
      if (keys && typeof keys === "object") {
        return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => {
          const value = read(key);
          return [key, value === undefined ? fallback : value];
        }));
      }
      const all = {};
      for (let i = 0; i < globalThis.localStorage.length; i += 1) {
        const name = globalThis.localStorage.key(i);
        if (name?.startsWith(PREFIX)) all[name.slice(PREFIX.length)] = read(name.slice(PREFIX.length));
      }
      return all;
    },
    async set(items) {
      const changes = {};
      Object.entries(items).forEach(([key, newValue]) => {
        changes[key] = { oldValue: read(key), newValue };
        globalThis.localStorage.setItem(PREFIX + key, JSON.stringify(newValue));
      });
      notify(changes);
    },
    async remove(keys) {
      const changes = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        changes[key] = { oldValue: read(key), newValue: undefined };
        globalThis.localStorage.removeItem(PREFIX + key);
      });
      notify(changes);
    }
  };

  // Another tab of the app changed the data: report it the way
  // chrome.storage.onChanged did, so the open page re-renders.
  globalThis.addEventListener?.("storage", (event) => {
    if (!event.key?.startsWith(PREFIX)) return;
    const parse = (raw) => {
      try {
        return raw == null ? undefined : JSON.parse(raw);
      } catch {
        return undefined;
      }
    };
    notify({
      [event.key.slice(PREFIX.length)]: { oldValue: parse(event.oldValue), newValue: parse(event.newValue) }
    });
  });

  // A web page may only open web pages.  Browser pages (chrome://, edge://) and
  // extension pages are refused by the browser, so the caller is told instead.
  class LinkMemoOpenError extends Error {
    constructor(reason, url) {
      super(reason);
      this.reason = reason;
      this.url = url;
    }
  }

  function isWebUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  globalThis.LinkMemoOpenError = LinkMemoOpenError;
  globalThis.chrome = {
    storage: {
      local,
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        }
      }
    },
    tabs: {
      async create({ url }) {
        if (!isWebUrl(url)) throw new LinkMemoOpenError("unsupported", url);
        const opened = globalThis.open(url, "_blank");
        // A blocked pop-up returns null.  Browsers allow one new tab per click,
        // so opening a whole group needs pop-ups allowed for this site.
        if (!opened) throw new LinkMemoOpenError("blocked", url);
        try {
          opened.opener = null;
        } catch {
          // Cross-origin by now; nothing to detach.
        }
        return { id: null };
      }
    },
    runtime: {
      getManifest() {
        return { version: LINK_MEMO_APP_VERSION };
      }
    }
  };
})();
