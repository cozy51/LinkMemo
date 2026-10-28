// End-to-end test of the sync engine: `node scripts/test_cloud_sync_flow.js`.
//
// The engine is loaded exactly as the editor page loads it, against a fake
// Supabase (an in-memory bucket behind a fake `fetch`) and a fake page built
// from the ids in index.html.  Two "PCs" share the bucket, so the paths that
// matter — seeding, pulling, conflicting, restoring, and refusing to shrink the
// cloud — are exercised for real, and a control the engine talks to but the
// page never declares fails the test.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createDocument, settle } = require("./fake_page.js");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sources = ["sync-core.js", "supabase-client.js", "storage.js", "cloud-sync.js"]
  .map((name) => ({ name, code: fs.readFileSync(path.join(root, name), "utf8") }));

function check(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

// --- fake Supabase ---------------------------------------------------------

function createCloud() {
  const files = new Map();
  const USER = { id: "user-1", email: "someone@example.com" };
  let issued = 0;

  function respond(status, body = "") {
    return {
      ok: status >= 200 && status < 300,
      status,
      async text() { return body; },
      async json() { return JSON.parse(body); }
    };
  }

  async function fetchImpl(input, options = {}) {
    const url = new URL(input);
    const method = options.method || "GET";
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (segments[0] === "auth") {
      if (url.pathname.endsWith("/logout")) return respond(204);
      const grant = url.searchParams.get("grant_type");
      const body = JSON.parse(options.body);
      if (grant === "password" && body.password !== "correct-horse") {
        return respond(400, JSON.stringify({ error_description: "Invalid login credentials" }));
      }
      issued += 1;
      return respond(200, JSON.stringify({
        access_token: `access-${issued}`,
        refresh_token: "refresh-token",
        expires_in: 3600,
        user: USER
      }));
    }

    // /storage/v1/object/...
    const rest = segments.slice(3);
    if (rest[0] === "authenticated") {
      const key = rest.slice(2).join("/");
      return files.has(key) ? respond(200, files.get(key)) : respond(404, "NoSuchKey");
    }
    if (rest[0] === "list") {
      const { prefix, sortBy } = JSON.parse(options.body);
      const names = [...files.keys()]
        .filter((key) => key.startsWith(`${prefix}/`))
        .map((key) => key.slice(prefix.length + 1))
        .filter((name) => !name.includes("/"))
        .sort((a, b) => (sortBy?.order === "desc" ? b.localeCompare(a) : a.localeCompare(b)));
      return respond(200, JSON.stringify(names.map((name) => ({ name }))));
    }
    if (method === "DELETE") {
      JSON.parse(options.body).prefixes.forEach((key) => files.delete(key));
      return respond(200, "{}");
    }
    files.set(rest.slice(1).join("/"), options.body);
    return respond(200, "{}");
  }

  return {
    files,
    fetch: fetchImpl,
    latest: () => JSON.parse(files.get("user-1/LinkMemo-latest.json")),
    history: () => [...files.keys()]
      .filter((key) => key.startsWith("user-1/LinkMemo-history/"))
      .sort()
  };
}

// --- a PC running the app ----------------------------------------------------

function createDevice(cloud, {
  groups = [], updatedAt = "", config = null, session = null
} = {}) {
  const store = {
    ...(groups.length ? { linkMemoData: { version: 1, groups } } : {}),
    ...(updatedAt ? { linkMemoDataUpdatedAt: updatedAt } : {}),
    ...(config ? { linkMemoCloudConfig: config } : {}),
    ...(session ? { linkMemoCloudSession: session } : {})
  };
  const doc = createDocument(html, "index.html");
  const timers = new Set();

  const chrome = {
    runtime: { getManifest: () => ({ version: "2.0.0" }) },
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
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Edg/120.0" },
    fetch: cloud.fetch,
    document: doc,
    clearTimeout,
    clearInterval,
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
    // The engine polls while the page is open; the test must not be kept alive
    // by that timer.
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); id.unref?.(); timers.add(id); return id; }
  };
  context.window = context;
  context.globalThis = context;
  context.linkMemoUI = { confirm: async () => true, toast: () => {} };
  vm.createContext(context);
  sources.forEach(({ name, code }) => vm.runInContext(code, context, { filename: name }));

  return {
    store,
    context,
    el: (id) => doc.querySelector(`#${id}`),
    status: () => doc.querySelector("#cloudSyncStatus").textContent,
    sync: () => context.linkMemoCloudSync.syncNow(),
    links: () => (store.linkMemoData?.groups || [])
      .flatMap((group) => group.bookmarks.map((bookmark) => bookmark.title))
      .join(","),
    async edit(nextGroups, at = new Date().toISOString()) {
      store.linkMemoData = { version: 1, groups: nextGroups };
      store.linkMemoDataUpdatedAt = at;
      context.linkMemoCloudSync.syncNow();
      await settle();
    },
    stop: () => timers.forEach((id) => { clearTimeout(id); clearInterval(id); })
  };
}

// --- the scenario ----------------------------------------------------------

const cloud = createCloud();
const CONFIG = { url: "https://example.supabase.co", anonKey: "anon-key", bucket: "todo-backups" };
const SESSION = {
  accessToken: "access-0",
  refreshToken: "refresh-token",
  expiresAt: Date.now() + 3600 * 1000,
  user: { id: "user-1", email: "someone@example.com" }
};

function link(name) {
  return { id: `bookmark-${name}`, title: name, url: `https://${name}.example/` };
}

function group(id, names, extra = {}) {
  return {
    id,
    name: `グループ${id}`,
    emoji: "📌",
    color: "blue",
    collapsed: false,
    bookmarks: names.map(link),
    ...extra
  };
}

const HOUR = 3600 * 1000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

(async function main() {
  // 1. The first PC publishes what it already has.
  const first = createDevice(cloud, {
    groups: [group("g1", ["a", "b"])],
    updatedAt: ago(5),
    config: CONFIG,
    session: SESSION
  });
  await settle();
  check(first.status(), "クラウドと同期済み", "The first PC finishes its initial sync");
  check(cloud.latest().sync.revision, 1, "The seeded document starts at revision 1");
  check(cloud.latest().counts.bookmarks, 2, "Both links reached the cloud");
  check(cloud.history().length, 0, "Seeding an empty cloud archives nothing");
  check(first.el("cloudSyncNow").hidden, false, "A signed-in PC can sync on demand");
  check(first.el("cloudSyncSettings").hidden, false, "The settings button is always available");

  // 2. A second PC starts empty and adopts the cloud copy.
  const second = createDevice(cloud, { config: CONFIG, session: SESSION });
  await settle();
  check(second.links(), "a,b", "The second PC pulls the links");
  check(second.store.linkMemoSyncState.revision, 1, "…and records the revision it holds");
  check(cloud.latest().sync.revision, 1, "Pulling does not republish");

  // 3. Folding a group is a view setting, not an edit to publish.
  await second.edit([group("g1", ["a", "b"], { collapsed: true })], ago(3));
  check(cloud.latest().sync.revision, 1, "Collapsing a group publishes nothing");

  // 4. An edit on the second PC is published, archiving what it replaces.
  await second.edit([group("g1", ["a", "b"]), group("g2", ["c"])], ago(2));
  check(cloud.latest().sync.revision, 2, "The edit becomes revision 2");
  check(cloud.latest().counts.bookmarks, 3, "…carrying the new link");
  check(cloud.latest().counts.groups, 2, "…and the new group");
  check(cloud.history().length, 1, "The replaced version is kept as a restore point");
  check(
    /-r000001-c1\.2\.2-auto\.json$/.test(cloud.history()[0]),
    true,
    "The restore point names the revision and the counts it holds"
  );

  // 5. The first PC edited meanwhile and is now behind: it must not lose either side.
  await first.edit([group("g1", ["a", "b"]), group("g3", ["d"])], ago(4));
  check(first.el("cloudConflictDialog").open, true, "Diverged copies open the conflict dialog");
  check(first.status(), "同期を保留中（内容が食い違っています）", "…and pause syncing");
  check(first.el("cloudSyncResolve").hidden, false, "…leaving a way back into the choice");
  check(cloud.latest().sync.revision, 2, "Nothing is published while the user decides");
  check(first.el("cloudConflictRemoteBookmarks").textContent, "3件", "The dialog counts the cloud copy");
  check(
    first.el("cloudConflictLocalBookmarks").textContent,
    "3件（増減なし）",
    "…against this PC's, difference first"
  );
  check(first.el("cloudConflictRemoteGroups").textContent, "2件", "Groups are compared too");
  check(
    first.el("cloudConflictRemoteDevice").textContent,
    "更新した端末：Windows / Edge",
    "…and the cloud copy says which PC wrote it"
  );
  // This PC's copy is two hours older than the cloud's, which is exactly the
  // overwrite that must not happen on a single click.
  check(first.el("cloudConflictAcknowledgeRow").hidden, false, "Overwriting with an older copy is held back");
  check(first.el("cloudConflictUseLocal").disabled, true, "…with the button disabled until acknowledged");
  check(
    first.el("cloudConflictUseLocal").textContent,
    "このPCの内容でクラウドを上書き",
    "…and the button says what it does"
  );
  check(
    /約\d+時間古い時点のもの/.test(first.el("cloudConflictWarning").textContent),
    true,
    "The warning says how far behind this PC is"
  );

  first.el("cloudConflictUseLocal").dispatch("click");
  await settle();
  check(cloud.latest().sync.revision, 2, "An unacknowledged overwrite does nothing at all");
  check(first.el("cloudConflictDialog").open, true, "…and leaves the choice on screen");

  first.el("cloudConflictAcknowledge").checked = true;
  first.el("cloudConflictAcknowledge").dispatch("change");
  check(first.el("cloudConflictUseLocal").disabled, false, "Acknowledging enables the overwrite");
  first.el("cloudConflictUseLocal").dispatch("click");
  await settle();
  check(cloud.latest().sync.revision, 3, "Keeping this PC's copy publishes a new revision");
  check(cloud.latest().counts.groups, 2, "…with this PC's groups");
  check(cloud.history().length, 2, "The overwritten cloud copy is archived first");
  check(first.status(), "クラウドと同期済み", "Sync resumes once the conflict is resolved");

  // 6. The other PC follows the resolution forward.
  second.sync();
  await settle();
  check(second.links(), "a,b,d", "The second PC pulls the resolved copy");

  // 7. Restoring an older point republishes it as the newest revision.
  second.el("cloudSyncHistory").dispatch("click");
  await settle();
  const rows = second.el("cloudHistoryList").children;
  check(rows.length, 3, "The list shows the current cloud version plus both restore points");
  check(rows[0].classList.contains("cloud-history-current"), true, "The current version anchors the list");
  check(
    rows[1].querySelector(".cloud-history-counts").textContent,
    "グループ2件・リンク3件・ドメイン3件",
    "Counts come from the file name, without downloading it"
  );

  const restoreButton = rows[2].children[1];
  check(restoreButton.textContent, "この時点に戻す", "Every restore point offers the rollback");
  restoreButton.dispatch("click");
  await settle();
  check(cloud.latest().sync.revision, 4, "A rollback moves the revision forward, never backwards");
  check(cloud.latest().counts.bookmarks, 2, "…and restores the contents of that point");
  check(second.links(), "a,b", "The PC that restored shows the restored links");
  check(cloud.history().length, 3, "The version that was replaced by the rollback is itself kept");

  // 8. The other side of a conflict: giving up this PC's copy keeps a way back.
  await first.edit([group("g1", ["a", "b"]), group("g3", ["d", "e"])]);
  check(first.el("cloudConflictDialog").open, true, "The diverged PC is asked again");
  check(
    first.el("cloudConflictAcknowledgeRow").hidden,
    true,
    "A copy newer than the cloud needs no acknowledgement, only a choice"
  );
  first.el("cloudConflictUseRemote").dispatch("click");
  await settle();
  check(first.links(), "a,b", "Choosing the cloud copy replaces this PC's links");
  check(
    cloud.history().some((key) => key.endsWith("-local-conflict.json")),
    true,
    "…after archiving what this PC held, so the choice stays reversible"
  );
  check(first.status(), "クラウドと同期済み", "The PC is in step with the cloud again");

  // 9. The accidental wipe: emptying a synced launcher asks before publishing.
  await first.edit([group("g1", ["a", "b", "c"]), group("g2", ["d", "e", "f"])]);
  check(cloud.latest().counts.bookmarks, 6, "An ordinary growth needs no confirmation");

  await first.edit([group("g1", [])]);
  check(first.el("cloudConflictDialog").open, true, "An emptied launcher is questioned");
  check(first.status(), "同期を保留中（件数が大きく減っています）", "…and holds the cloud copy back");
  check(cloud.latest().counts.bookmarks, 6, "Nothing was deleted in the cloud meanwhile");
  check(
    first.el("cloudConflictWarning").textContent.includes("6件のリンクが、すべて無くなります"),
    true,
    "The warning says exactly what would be lost"
  );
  check(first.el("cloudConflictLocalBookmarks").textContent, "0件（-6）", "…and the table shows the drop");
  check(first.el("cloudConflictAcknowledgeRow").hidden, false, "A shrinking push always asks");

  const historyBefore = cloud.history().length;
  first.el("cloudConflictAcknowledge").checked = true;
  first.el("cloudConflictAcknowledge").dispatch("change");
  first.el("cloudConflictUseLocal").dispatch("click");
  await settle();
  check(cloud.latest().counts.bookmarks, 0, "A confirmed deletion does reach the cloud");
  check(cloud.history().length, historyBefore + 1, "…with the deleted links kept as a restore point");
  check(first.status(), "クラウドと同期済み", "Sync resumes after the confirmation");

  // 10. A PC that has never been set up: settings first, then sign-in.
  const fresh = createDevice(cloud, { groups: [group("g9", ["z"])], updatedAt: ago(1) });
  await settle();
  check(fresh.status(), "クラウド同期は未設定（ローカル保存のみ）", "An unconfigured PC says so");
  check(fresh.el("cloudSyncSignIn").hidden, true, "…and offers no sign-in yet");

  fresh.el("cloudUrlInput").value = `${CONFIG.url}/`;
  fresh.el("cloudKeyInput").value = CONFIG.anonKey;
  fresh.el("cloudBucketInput").value = "";
  fresh.el("cloudSettingsForm").dispatch("submit");
  await settle();
  check(fresh.store.linkMemoCloudConfig.url, CONFIG.url, "A trailing slash in the URL is dropped");
  check(fresh.store.linkMemoCloudConfig.bucket, "todo-backups", "An empty bucket falls back to the default");
  check(fresh.status(), "ログインするとクラウドと同期します", "Configured but signed out");
  check(fresh.el("cloudSyncSignIn").hidden, false, "…and now offers sign-in");

  fresh.el("cloudEmailInput").value = "someone@example.com";
  fresh.el("cloudPasswordInput").value = "wrong";
  fresh.el("cloudSignInForm").dispatch("submit");
  await settle();
  check(
    fresh.el("cloudSignInMessage").textContent,
    "メールアドレスかパスワードが違います",
    "A rejected sign-in says which half to check"
  );
  check(fresh.el("cloudSignInDialog").open, false, "…without having opened a session");

  fresh.el("cloudPasswordInput").value = "correct-horse";
  fresh.el("cloudSignInForm").dispatch("submit");
  await settle();
  check(fresh.store.linkMemoCloudSession.user.id, "user-1", "The session is remembered for next time");
  check(fresh.el("cloudPasswordInput").value, "", "The password is not left in the field");
  // This PC holds one link of its own against an established cloud copy, which
  // is exactly the divergence the engine must not resolve on its own.
  check(fresh.el("cloudConflictDialog").open, true, "Its unsynced link is not silently dropped");

  [first, second, fresh].forEach((device) => device.stop());
  console.log("cloud sync flow: すべてのテストに合格しました");
})();
