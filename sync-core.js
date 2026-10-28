// Pure helpers shared by the page and the cloud sync engine.
// Nothing here touches the network, chrome.storage, or the DOM, so the rules
// that decide which copy of the data wins can be tested on their own
// (`node scripts/test_cloud_sync.js`).

const LINK_MEMO_BACKUP_FORMAT = "link-memo";
const LINK_MEMO_BACKUP_KIND = "full-backup";
// The schema the cloud document is written with; version 1 is the plain export
// file that earlier releases produced and that is still readable.
const LINK_MEMO_SCHEMA_VERSION = 2;
const LINK_MEMO_MAX_GROUPS = 300;
const LINK_MEMO_MAX_BOOKMARKS = 5000;
const LINK_MEMO_GROUP_COLORS = [
  "blue",
  "lightblue",
  "purple",
  "green",
  "yellow",
  "orange",
  "pink",
  "black"
];

function createLinkMemoItemFingerprint(item) {
  const source = JSON.stringify(item);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Besides web pages, extension pages (chrome-extension://) and the browser's own
// pages (chrome://, edge://) can be opened with chrome.tabs.create, so they are
// accepted too.  Anything else — javascript:, data:, file: — is rejected.
const LINKMEMO_ALLOWED_PROTOCOLS = ["http:", "https:", "chrome-extension:", "chrome:", "edge:"];

function normalizeLinkMemoUrl(value) {
  let input = String(value ?? "").trim();
  if (!input) return "";

  // Edge shows its extension pages as "extension://<id>/..." in the address bar,
  // but they can only be opened by their real chrome-extension:// address.
  input = input.replace(/^extension:\/\//i, "chrome-extension://");
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(withProtocol);
    if (!LINKMEMO_ALLOWED_PROTOCOLS.includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function linkMemoHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// A record saved by a very old build may have no id.  Deriving one from the
// contents keeps it stable across PCs: a random id would make the same link look
// like a different record on every load and never stop syncing.
function normalizeLinkMemoBookmark(bookmark) {
  const url = normalizeLinkMemoUrl(bookmark?.url);
  if (!url) return null;
  const title = String(bookmark?.title ?? "").trim().slice(0, 160) || linkMemoHostname(url) || url;
  const id = String(bookmark?.id ?? "").trim()
    || `bookmark-${createLinkMemoItemFingerprint({ title, url })}`;
  return { id, title, url };
}

// Normalize any payload — chrome.storage, a cloud document, an imported file —
// the same way, so two copies of the same data compare equal.  The order of
// groups and links is *kept*: it is arranged by hand in the editor and is part
// of the data, not a presentation detail.
function normalizeLinkMemoDataset(source) {
  const rawGroups = Array.isArray(source)
    ? source
    : (Array.isArray(source?.groups) ? source.groups : []);
  const seenGroups = new Set();
  const seenBookmarks = new Set();

  const groups = rawGroups
    .filter((group) => group && typeof group === "object" && !Array.isArray(group))
    .map((group) => {
      const name = String(group.name ?? "").trim().slice(0, 60) || "名称未設定";
      const emoji = String(group.emoji ?? "").trim().slice(0, 8) || "📌";
      return {
        id: String(group.id ?? "").trim() || `group-${createLinkMemoItemFingerprint({ name, emoji })}`,
        name,
        emoji,
        color: LINK_MEMO_GROUP_COLORS.includes(group.color) ? group.color : "blue",
        collapsed: Boolean(group.collapsed),
        bookmarks: (Array.isArray(group.bookmarks) ? group.bookmarks : [])
          .map(normalizeLinkMemoBookmark)
          .filter(Boolean)
          // Two records with one id are one record: keeping both would make the
          // same link look different on the PC that de-duplicated it.
          .filter((bookmark) => {
            if (seenBookmarks.has(bookmark.id)) return false;
            seenBookmarks.add(bookmark.id);
            return true;
          })
      };
    })
    .filter((group) => {
      if (seenGroups.has(group.id)) return false;
      seenGroups.add(group.id);
      return true;
    });

  return { groups };
}

function countLinkMemoRecords(dataset) {
  const groups = Array.isArray(dataset?.groups) ? dataset.groups : [];
  const domains = new Set();
  let bookmarks = 0;
  groups.forEach((group) => {
    (Array.isArray(group?.bookmarks) ? group.bookmarks : []).forEach((bookmark) => {
      bookmarks += 1;
      const host = linkMemoHostname(normalizeLinkMemoUrl(bookmark?.url));
      if (host) domains.add(host);
    });
  });
  return { groups: groups.length, bookmarks, domains: domains.size };
}

// A brand-new install starts with one empty group, so "empty" is about links:
// a browser holding no link has nothing of its own to defend.
function isLinkMemoDatasetEmpty(dataset) {
  return countLinkMemoRecords(dataset).bookmarks === 0;
}

// The collapsed flag is how this PC is *looking* at the data, not part of it:
// folding a group on one PC must not count as an edit to push, nor as a
// difference worth asking the user about.
function linkMemoFingerprintSource(dataset) {
  return (Array.isArray(dataset?.groups) ? dataset.groups : []).map((group) => [
    group?.id,
    group?.name,
    group?.emoji,
    group?.color,
    (Array.isArray(group?.bookmarks) ? group.bookmarks : [])
      .map((bookmark) => [bookmark?.id, bookmark?.title, bookmark?.url])
  ]);
}

// A 32-bit hash alone would make an undetected collision — a change that never
// reaches the cloud — a real if unlikely risk, so combine two independent
// hashes with the serialized length.
function createLinkMemoFingerprint(dataset) {
  const source = JSON.stringify(linkMemoFingerprintSource(dataset));
  let low = 2166136261;
  let high = 40389;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    low = Math.imul(low ^ code, 16777619);
    high = Math.imul(high ^ (code + index), 2246822519);
  }
  return `${source.length.toString(36)}.${(low >>> 0).toString(36)}.${(high >>> 0).toString(36)}`;
}

// Which groups this PC has folded is a local view setting, so a copy arriving
// from another PC keeps the folding this one already had.
function preserveLinkMemoViewState(incoming, current) {
  const collapsed = new Map(
    (Array.isArray(current?.groups) ? current.groups : [])
      .map((group) => [group?.id, Boolean(group?.collapsed)])
  );
  return {
    groups: (Array.isArray(incoming?.groups) ? incoming.groups : []).map((group) => ({
      ...group,
      collapsed: collapsed.has(group?.id) ? collapsed.get(group.id) : Boolean(group?.collapsed)
    }))
  };
}

// The record counts of a document, however it was written: documents written by
// the cloud sync carry a `counts` block, exported files only the groups.
function readLinkMemoCounts(source) {
  const counts = source?.counts;
  const computed = countLinkMemoRecords(
    Array.isArray(source) ? { groups: source } : source
  );
  return {
    groups: Number.isFinite(counts?.groups) ? counts.groups : computed.groups,
    bookmarks: Number.isFinite(counts?.bookmarks) ? counts.bookmarks : computed.bookmarks,
    domains: Number.isFinite(counts?.domains) ? counts.domains : computed.domains
  };
}

function formatLinkMemoCounts(counts) {
  if (!counts) return "";
  return `グループ${counts.groups}件・リンク${counts.bookmarks}件・ドメイン${counts.domains}件`;
}

function validateLinkMemoBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("バックアップファイルではありません");
  }
  // Files exported before this format was named carry no `format` at all, and
  // they are still perfectly good backups.
  if (data.format !== undefined && data.format !== LINK_MEMO_BACKUP_FORMAT) {
    throw new Error("対応していないバックアップ形式です");
  }
  if (!Array.isArray(data.groups)) {
    throw new Error("グループのデータがありません");
  }
  if (data.groups.length > LINK_MEMO_MAX_GROUPS) {
    throw new Error("グループの件数が多すぎます");
  }

  let bookmarks = 0;
  data.groups.forEach((group) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      throw new Error("グループのデータが不正です");
    }
    if (group.bookmarks !== undefined && !Array.isArray(group.bookmarks)) {
      throw new Error("リンクのデータが不正です");
    }
    (group.bookmarks || []).forEach((bookmark) => {
      if (!bookmark || typeof bookmark !== "object" || Array.isArray(bookmark)) {
        throw new Error("リンクのデータが不正です");
      }
      bookmarks += 1;
    });
  });
  if (bookmarks > LINK_MEMO_MAX_BOOKMARKS) {
    throw new Error("リンクの件数が多すぎます");
  }
  return data;
}

// Decide what to do with a cloud document without touching either copy, so the
// rule that prevents older data from winning stays small enough to test.
function decideLinkMemoSyncAction(input) {
  const {
    remoteExists,
    remoteLegacy = false,
    remoteRevision = 0,
    remoteFingerprint = "",
    baseRevision = 0,
    baseFingerprint = "",
    localFingerprint = "",
    localEmpty = false
  } = input;

  // A browser that has never synced and holds nothing has no opinion to defend;
  // one that *has* synced and is now empty was emptied by an action, so that
  // deletion is a real edit and has to pass the accidental-wipe guard instead of
  // being silently undone.
  const hasLineage = baseRevision > 0 || baseFingerprint !== "";
  const unsynced = localEmpty && !hasLineage;

  if (!remoteExists) return unsynced ? "idle" : "push";

  // Edits this browser made that the cloud has never seen.
  const localDirty = !unsynced && localFingerprint !== baseFingerprint;

  // Identical content needs no transfer; only the revision lineage is adjusted.
  if (remoteFingerprint === localFingerprint) {
    // Except when upgrading from a pre-revision document: give it a revision now
    // so the first later edit is an ordinary push rather than a conflict.
    if (remoteLegacy) return "push";
    return remoteRevision === baseRevision ? "idle" : "adopt";
  }

  // Documents written before revisions existed carry no ordering information,
  // so guessing which side is newer is exactly the mistake to avoid.
  if (remoteLegacy) return localDirty ? "conflict" : "pull";

  if (remoteRevision > baseRevision) return localDirty ? "conflict" : "pull";
  // The cloud moved backwards relative to this browser: never silently accept
  // it, and never silently overwrite it either.
  if (remoteRevision < baseRevision) return "conflict";
  return localDirty ? "push" : "pull";
}

// Guard against the accidental wipe: a cleared browser profile, a mis-clicked
// bulk delete, or an import of a much older file must not quietly shrink the
// authoritative copy.
function assessLinkMemoShrink(remoteDataset, localDataset) {
  const remote = countLinkMemoRecords(remoteDataset);
  const local = countLinkMemoRecords(localDataset);
  if (remote.bookmarks === 0 && remote.groups === 0) return null;

  const removed = remote.bookmarks - local.bookmarks;
  const removedGroups = remote.groups - local.groups;
  const risk = { remote, local, removed, removedGroups };

  if (remote.bookmarks > 0 && local.bookmarks === 0) {
    return { ...risk, reason: "empty" };
  }
  if (remote.bookmarks >= 5 && removed >= Math.ceil(remote.bookmarks / 2)) {
    return { ...risk, reason: "shrink" };
  }
  // Losing half the groups matters even when the links happen to survive: it is
  // the shape of the whole launcher that changed.
  if (remote.groups >= 3 && removedGroups >= Math.ceil(remote.groups / 2)) {
    return { ...risk, reason: "groups" };
  }
  return null;
}

function describeLinkMemoShrink(risk) {
  if (!risk) return "";
  if (risk.reason === "empty") {
    return `クラウドにある${risk.remote.bookmarks}件のリンクが、すべて無くなります。`;
  }
  if (risk.reason === "groups") {
    return `グループが${risk.remote.groups}件から${risk.local.groups}件へ`
      + `${risk.removedGroups}件減ります。`;
  }
  return `リンクが${risk.remote.bookmarks}件から${risk.local.bookmarks}件へ`
    + `${risk.removed}件減ります。`;
}

// Clocks between devices drift, so a file has to look meaningfully older than
// the current data before the import is treated as a step backwards.
const LINK_MEMO_STALE_IMPORT_TOLERANCE_MS = 60 * 1000;

function pickNewestLinkMemoTimestamp(...values) {
  let newest = 0;
  values.forEach((value) => {
    const time = new Date(value ?? NaN).getTime();
    if (Number.isFinite(time) && time > newest) newest = time;
  });
  return newest ? new Date(newest).toISOString() : "";
}

// Importing a file is the one action that can walk the data backwards on
// purpose, so it is judged on age rather than size alone: a file exported before
// the current data was last changed would silently discard everything since.
function assessLinkMemoImport({
  fileExportedAt, fileDataset, currentUpdatedAt, currentDataset
} = {}) {
  const fileAt = pickNewestLinkMemoTimestamp(fileExportedAt);
  const currentAt = pickNewestLinkMemoTimestamp(currentUpdatedAt);
  const shrink = assessLinkMemoShrink(currentDataset, fileDataset);
  const fileTime = Date.parse(fileAt);
  const currentTime = Date.parse(currentAt);
  const comparable = Number.isFinite(fileTime) && Number.isFinite(currentTime);
  const staleMs = comparable ? currentTime - fileTime : 0;

  const level = comparable && staleMs > LINK_MEMO_STALE_IMPORT_TOLERANCE_MS ? "danger"
    : shrink ? "caution"
    : "none";
  return { level, staleMs, fileAt, currentAt, shrink, comparable };
}

// The timestamp leads the name so a plain descending sort is chronological,
// whatever revision each entry carries.  The record counts ride along so the
// history list can show them without downloading every file.
function createLinkMemoHistoryName(revision, label, counts, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const tally = counts
    ? `-c${counts.groups}.${counts.bookmarks}.${counts.domains}`
    : "";
  return `${stamp}-r${String(revision).padStart(6, "0")}${tally}-${label}.json`;
}

function parseLinkMemoHistoryName(name) {
  const match = /^(\d{8})T(\d{6})Z-r(\d+)(?:-c([\d.]+))?-(.+)\.json$/.exec(name);
  if (!match) return { revision: null, date: null, label: name, counts: null };

  const [, day, time, revision, tally, label] = match;
  const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`
    + `T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;

  const parts = tally ? tally.split(".").map(Number) : [];
  const counts = parts.length === 3 && parts.every(Number.isFinite)
    ? { groups: parts[0], bookmarks: parts[1], domains: parts[2] }
    : null;
  return { revision: Number(revision), date: new Date(iso), label, counts };
}

// Cloud history retention.  Recent restore points are what undo a mis-click and
// older ones are what undo a mistake noticed days later, so keep every recent
// entry and thin everything older down to one per day.  `entries` must be newest
// first; the returned entries are the ones safe to delete.
function selectExpiredLinkMemoHistory(entries, { recentKeep = 30, dailyKeep = 30 } = {}) {
  if (!Array.isArray(entries) || entries.length <= recentKeep) return [];
  const keptDays = new Set();
  return entries.slice(recentKeep).filter((entry) => {
    const day = entry?.date instanceof Date && !Number.isNaN(entry.date.getTime())
      ? entry.date.toISOString().slice(0, 10)
      : null;
    // An entry whose timestamp cannot be read is kept: deleting a restore point
    // we do not understand is the one outcome worth avoiding here.
    if (!day) return false;
    if (keptDays.has(day)) return true;
    keptDays.add(day);
    return keptDays.size > dailyKeep;
  });
}

function formatLinkMemoElapsed(milliseconds) {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
  if (minutes < 1) return "1分未満";
  if (minutes < 60) return `${minutes}分`;
  // Rounded, because these read as "about": floor would call 2時間59分 "2時間",
  // understating what an import would discard.
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `約${hours}時間`;
  return `約${Math.round(minutes / 1440)}日`;
}

function describeLinkMemoDevice(userAgent = "") {
  const agent = String(userAgent || "");
  const platform = /Windows/.test(agent) ? "Windows"
    : /Macintosh|Mac OS/.test(agent) ? "Mac"
    : /iPhone|iPad|iPod/.test(agent) ? "iOS"
    : /Android/.test(agent) ? "Android"
    : /Linux/.test(agent) ? "Linux"
    : "不明な端末";
  const browser = /Edg\//.test(agent) ? "Edge"
    : /OPR\//.test(agent) ? "Opera"
    : /Chrome\//.test(agent) ? "Chrome"
    : /Firefox\//.test(agent) ? "Firefox"
    : /Safari\//.test(agent) ? "Safari"
    : "ブラウザー";
  return `${platform} / ${browser}`;
}

function createLinkMemoSyncState() {
  return {
    userId: "",
    revision: 0,
    fingerprint: "",
    remoteUpdatedAt: "",
    lastSyncedAt: ""
  };
}

function sanitizeLinkMemoSyncState(stored, userId = "") {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return createLinkMemoSyncState();
  }
  const state = {
    userId: String(stored.userId || ""),
    revision: Number.isFinite(stored.revision) && stored.revision > 0
      ? Math.floor(stored.revision)
      : 0,
    fingerprint: String(stored.fingerprint || ""),
    remoteUpdatedAt: String(stored.remoteUpdatedAt || ""),
    lastSyncedAt: String(stored.lastSyncedAt || "")
  };
  // Revisions belong to one account's document; another account's history says
  // nothing about how fresh this browser's copy is.
  if (userId && state.userId && state.userId !== userId) return createLinkMemoSyncState();
  return state;
}

// Node's test runner loads this file with `vm`; the browser loads it as a
// classic script, where these names are already global.
if (typeof module === "object" && module.exports) {
  module.exports = {
    LINK_MEMO_BACKUP_FORMAT,
    LINK_MEMO_BACKUP_KIND,
    LINK_MEMO_SCHEMA_VERSION,
    LINK_MEMO_MAX_GROUPS,
    LINK_MEMO_MAX_BOOKMARKS,
    LINK_MEMO_GROUP_COLORS,
    normalizeLinkMemoUrl,
    normalizeLinkMemoBookmark,
    normalizeLinkMemoDataset,
    countLinkMemoRecords,
    isLinkMemoDatasetEmpty,
    createLinkMemoFingerprint,
    preserveLinkMemoViewState,
    readLinkMemoCounts,
    formatLinkMemoCounts,
    validateLinkMemoBackup,
    decideLinkMemoSyncAction,
    assessLinkMemoShrink,
    describeLinkMemoShrink,
    assessLinkMemoImport,
    pickNewestLinkMemoTimestamp,
    createLinkMemoHistoryName,
    parseLinkMemoHistoryName,
    selectExpiredLinkMemoHistory,
    formatLinkMemoElapsed,
    describeLinkMemoDevice,
    createLinkMemoSyncState,
    sanitizeLinkMemoSyncState
  };
}
