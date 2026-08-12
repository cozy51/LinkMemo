// The editor's import flow: `node scripts/test_import_guard.js`.
//
// Importing a file is the one action that replaces everything on purpose, so it
// is the one action that has to explain itself first.  The editor is loaded as
// options.html loads it, against a fake page and a fake chrome.storage, and the
// dialog is driven the way a person would drive it.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createDocument, settle } = require("./fake_page.js");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "options.html"), "utf8");
const sources = ["sync-core.js", "storage.js", "options.js"]
  .map((name) => ({ name, code: fs.readFileSync(path.join(root, name), "utf8") }));

function check(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function link(name) {
  return { id: `bookmark-${name}`, title: name, url: `https://${name}.example/` };
}

function group(id, names) {
  return {
    id,
    name: `グループ${id}`,
    emoji: "📌",
    color: "blue",
    collapsed: false,
    bookmarks: names.map(link)
  };
}

function createEditor({ groups = [], updatedAt = "" } = {}) {
  const store = {
    ...(groups.length ? { linkMemoData: { version: 1, groups } } : {}),
    ...(updatedAt ? { linkMemoDataUpdatedAt: updatedAt } : {})
  };
  const doc = createDocument(html, "options.html");
  const timers = new Set();

  const chrome = {
    runtime: { getManifest: () => ({ version: "1.3.0" }) },
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list
            .filter((key) => key in store)
            .map((key) => [key, JSON.parse(JSON.stringify(store[key]))]));
        },
        async set(items) { Object.assign(store, JSON.parse(JSON.stringify(items))); },
        async remove(key) { delete store[key]; }
      },
      onChanged: { addListener() {} }
    }
  };

  const context = {
    JSON, Math, Number, String, Boolean, Array, Object, Date, RegExp, Set, Map,
    Promise, Intl, URL, Error, console, chrome,
    crypto: { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` },
    document: doc,
    clearTimeout,
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  sources.forEach(({ name, code }) => vm.runInContext(code, context, { filename: name }));

  return {
    store,
    el: (id) => doc.querySelector(`#${id}`),
    links: () => (store.linkMemoData?.groups || [])
      .flatMap((entry) => entry.bookmarks.map((bookmark) => bookmark.title))
      .join(","),
    async importFile(name, payload) {
      const input = doc.querySelector("#importData");
      input.files = [{ name, async text() { return JSON.stringify(payload); } }];
      input.dispatch("change");
      await settle();
    },
    stop: () => timers.forEach((id) => clearTimeout(id))
  };
}

const HOUR = 3600 * 1000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

function backup(groups, exportedAt) {
  return {
    format: "link-memo",
    kind: "full-backup",
    version: 1,
    schemaVersion: 2,
    ...(exportedAt ? { exportedAt } : {}),
    groups
  };
}

(async function main() {
  const editor = createEditor({
    groups: [group("g1", ["a", "b", "c"]), group("g2", ["d", "e"])],
    updatedAt: ago(0)
  });
  await settle();
  check(editor.el("bookmarkCount").textContent, "5", "The editor starts from what is stored");

  // 1. An older file: nothing is replaced until the loss is acknowledged.
  await editor.importFile("backup-old.json", backup([group("g1", ["a", "b"])], ago(3)));
  check(editor.el("importDialog").open, true, "An import over existing data always asks");
  check(editor.el("importCurrentBookmarkCount").textContent, "5件", "The current links are counted");
  check(editor.el("importFileBookmarkCount").textContent, "2件（-3）", "…and the file's difference shown");
  check(editor.el("importCurrentGroupCount").textContent, "2件", "Groups are compared too");
  check(editor.el("importFileGroupCount").textContent, "1件（-1）", "…with their difference");
  check(editor.el("importFileDomainCount").textContent, "2件（-3）", "…and domains as well");
  check(editor.el("importWarning").hidden, false, "An older file is called out");
  check(
    /約3時間古い内容です/.test(editor.el("importWarning").textContent),
    true,
    "…saying how much older it is"
  );
  check(
    editor.el("importWarning").textContent.includes("リンクが5件から2件へ3件減ります"),
    true,
    "…and what it would remove"
  );
  check(editor.el("importWarning").dataset.level, "danger", "…at the strongest level");
  check(editor.el("importAcknowledgeRow").hidden, false, "…behind an acknowledgement");
  check(editor.el("confirmImport").disabled, true, "…with the button held until it is ticked");
  check(editor.el("confirmImport").textContent, "古い内容で上書きする", "…and the button saying so");

  editor.el("importForm").dispatch("submit");
  await settle();
  check(editor.links(), "a,b,c,d,e", "Submitting without the acknowledgement changes nothing");
  check(editor.el("importDialog").open, true, "…and keeps the dialog open");

  editor.el("importAcknowledge").checked = true;
  editor.el("importAcknowledge").dispatch("change");
  check(editor.el("confirmImport").disabled, false, "Ticking it releases the button");
  editor.el("importForm").dispatch("submit");
  await settle();
  check(editor.links(), "a,b", "An acknowledged import does replace everything");
  check(editor.el("importDialog").open, false, "…and closes the dialog");

  // 2. Cancelling leaves the data alone.
  await editor.importFile("backup-new.json", backup([group("g1", ["a", "b", "c", "d"])], ago(0)));
  check(editor.el("importDialog").open, true, "A newer file is still shown before it is applied");
  check(editor.el("importWarning").hidden, true, "…without a warning");
  check(editor.el("importAcknowledgeRow").hidden, true, "…and without an acknowledgement");
  check(editor.el("confirmImport").textContent, "全件をインポート", "…offering a plain import");
  editor.el("cancelImport").dispatch("click");
  await settle();
  check(editor.links(), "a,b", "Cancelling imports nothing");

  editor.el("importForm").dispatch("submit");
  await settle();
  check(editor.links(), "a,b", "…and a submit afterwards has nothing to apply");

  // 3. A file whose age cannot be read is judged on its counts, and says so.
  await editor.importFile("legacy.json", { version: 1, groups: [group("g1", ["a", "b", "c"])] });
  check(editor.el("importFileUpdatedAt").textContent, "不明", "An undated file says its date is unknown");
  check(
    editor.el("importWarning").textContent.includes("日時を読み取れないため"),
    true,
    "…and the warning explains what cannot be judged"
  );
  check(editor.el("importAcknowledgeRow").hidden, true, "…but growing data is not treated as a loss");
  editor.el("importForm").dispatch("submit");
  await settle();
  check(editor.links(), "a,b,c", "The file written before this format existed still imports");

  // 4. An empty file is the loudest case of all.
  await editor.importFile("empty.json", backup([], ago(0)));
  check(
    editor.el("importWarning").textContent.includes("リンクが1件も入っていません"),
    true,
    "An empty file says the登録内容 would all go"
  );
  check(editor.el("importWarning").dataset.level, "caution", "…as a caution when it is not also old");

  editor.el("closeImportDialog").dispatch("click");
  await settle();
  check(editor.links(), "a,b,c", "Closing the dialog imports nothing");

  // 5. A file that is not a backup at all.
  await editor.importFile("notes.json", { hello: "world" });
  check(editor.el("importDialog").open, false, "A file with no groups never opens the dialog");
  check(editor.el("toast").textContent, "ファイルを読み込めませんでした", "…and says why");

  // 6. A brand-new install has nothing to lose, so it just imports.
  const fresh = createEditor();
  await settle();
  await fresh.importFile("backup.json", backup([group("g1", ["a", "b"])], ago(10)));
  check(fresh.el("importDialog").open, false, "A first import needs no comparison");
  check(fresh.links(), "a,b", "…and lands straight away");

  [editor, fresh].forEach((page) => page.stop());
  console.log("import guard: すべてのテストに合格しました");
})();
