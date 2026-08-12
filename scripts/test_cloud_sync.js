// Unit tests for the rules that decide which copy of the data wins:
// `node scripts/test_cloud_sync.js`.
const assert = require("assert");
const {
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
  createLinkMemoHistoryName,
  parseLinkMemoHistoryName,
  selectExpiredLinkMemoHistory,
  formatLinkMemoElapsed,
  describeLinkMemoDevice,
  sanitizeLinkMemoSyncState
} = require("../sync-core.js");

function group(id, urls, extra = {}) {
  return {
    id,
    name: `グループ${id}`,
    emoji: "📌",
    color: "blue",
    collapsed: false,
    bookmarks: urls.map((url, index) => ({ id: `${id}-${index}`, title: url, url })),
    ...extra
  };
}

function dataset(...groups) {
  return normalizeLinkMemoDataset({ groups });
}

// --- normalization ---------------------------------------------------------

{
  const normalized = normalizeLinkMemoDataset({
    groups: [
      {
        id: "g1",
        name: "  仕事  ",
        color: "chartreuse",
        bookmarks: [
          { id: "b1", title: "例", url: "example.com" },
          { id: "b2", title: "無効", url: "javascript:alert(1)" },
          { id: "b1", title: "重複ID", url: "https://other.example/" },
          { title: "IDなし", url: "https://third.example/" }
        ]
      },
      "壊れた行",
      { id: "g1", name: "重複グループ", bookmarks: [] }
    ]
  });

  assert.strictEqual(normalized.groups.length, 1, "重複IDのグループはひとつにまとまる");
  assert.strictEqual(normalized.groups[0].name, "仕事", "前後の空白は落とす");
  assert.strictEqual(normalized.groups[0].color, "blue", "未知の色は既定へ戻す");
  const bookmarks = normalized.groups[0].bookmarks;
  assert.strictEqual(bookmarks.length, 2, "無効なURLと重複IDのリンクは落ちる");
  assert.strictEqual(bookmarks[0].url, "https://example.com/", "プロトコル無しは https を補う");
  assert.ok(bookmarks[1].id.startsWith("bookmark-"), "IDの無いリンクには内容から導いたIDを与える");

  // The derived id has to be the same on every PC, or the same link would look
  // like a different record after each load.
  const again = normalizeLinkMemoDataset({
    groups: [{ id: "g1", bookmarks: [{ title: "IDなし", url: "https://third.example/" }] }]
  });
  assert.strictEqual(again.groups[0].bookmarks[0].id, bookmarks[1].id, "導いたIDは毎回同じ");
}

{
  const counts = countLinkMemoRecords(dataset(
    group("g1", ["https://example.com/a", "https://example.com/b"]),
    group("g2", ["https://other.example/"])
  ));
  assert.deepStrictEqual(counts, { groups: 2, bookmarks: 3, domains: 2 }, "件数はグループ・リンク・ドメイン");
  assert.strictEqual(
    formatLinkMemoCounts(counts),
    "グループ2件・リンク3件・ドメイン2件",
    "件数の表示は3つとも並べる"
  );
  assert.strictEqual(isLinkMemoDatasetEmpty(dataset(group("g1", []))), true, "リンクが無ければ空");
}

// --- fingerprints ----------------------------------------------------------

{
  const base = dataset(group("g1", ["https://example.com/a"]));
  const folded = dataset(group("g1", ["https://example.com/a"], { collapsed: true }));
  assert.strictEqual(
    createLinkMemoFingerprint(base),
    createLinkMemoFingerprint(folded),
    "折りたたみは見え方であって、同期すべき変更ではない"
  );

  const renamed = dataset(group("g1", ["https://example.com/a"], { name: "別名" }));
  assert.notStrictEqual(
    createLinkMemoFingerprint(base),
    createLinkMemoFingerprint(renamed),
    "グループ名の変更は同期すべき変更"
  );

  const reordered = dataset(
    group("g2", ["https://other.example/"]),
    group("g1", ["https://example.com/a"])
  );
  const original = dataset(
    group("g1", ["https://example.com/a"]),
    group("g2", ["https://other.example/"])
  );
  assert.notStrictEqual(
    createLinkMemoFingerprint(original),
    createLinkMemoFingerprint(reordered),
    "並び順は手で決めたデータなので、変われば同期する"
  );

  const preserved = preserveLinkMemoViewState(
    dataset(group("g1", ["https://example.com/a"], { collapsed: true })),
    dataset(group("g1", ["https://example.com/a"], { collapsed: false }))
  );
  assert.strictEqual(
    preserved.groups[0].collapsed,
    false,
    "他のPCから届いた内容でも、このPCの折りたたみ方は保つ"
  );
}

// --- the decision table ----------------------------------------------------

const BASE = {
  remoteExists: true,
  remoteLegacy: false,
  remoteRevision: 5,
  remoteFingerprint: "remote",
  baseRevision: 5,
  baseFingerprint: "local",
  localFingerprint: "local",
  localEmpty: false
};

const cases = [
  ["初回起動で空なら、クラウドが無くても何もしない",
    { ...BASE, remoteExists: false, localEmpty: true, baseRevision: 0, baseFingerprint: "" }, "idle"],
  ["登録済みならクラウドが無いときは publish する",
    { ...BASE, remoteExists: false }, "push"],
  ["同期済みのPCが空になったのは削除という編集なので push（ガードは push 側）",
    { ...BASE, remoteExists: false, localEmpty: true }, "push"],
  ["内容が一致していれば転送しない",
    { ...BASE, remoteFingerprint: "local" }, "idle"],
  ["内容は同じでも版が違えば版だけ引き継ぐ",
    { ...BASE, remoteFingerprint: "local", remoteRevision: 7 }, "adopt"],
  ["版の無い古い文書は、内容が同じなら版を与えるために push",
    { ...BASE, remoteFingerprint: "local", remoteLegacy: true, remoteRevision: 0 }, "push"],
  ["クラウドが進んでいて手元に未同期の変更が無ければ pull",
    { ...BASE, remoteRevision: 9, baseFingerprint: "local" }, "pull"],
  ["クラウドが進んでいて手元にも変更があれば conflict",
    { ...BASE, remoteRevision: 9, baseFingerprint: "old" }, "conflict"],
  ["クラウドが巻き戻っていたら、黙って受け入れも上書きもしない",
    { ...BASE, remoteRevision: 3 }, "conflict"],
  ["同じ版で手元だけ変わっていれば push",
    { ...BASE, baseFingerprint: "old" }, "push"],
  ["同じ版で手元が変わっていなければ pull（クラウドが正）",
    { ...BASE }, "pull"],
  ["版を持たない古い文書と未同期の変更がぶつかれば conflict",
    { ...BASE, remoteLegacy: true, remoteRevision: 0, baseFingerprint: "old" }, "conflict"]
];

cases.forEach(([label, input, expected]) => {
  assert.strictEqual(decideLinkMemoSyncAction(input), expected, label);
});

// --- the accidental wipe ---------------------------------------------------

{
  const remote = dataset(group("g1", [
    "https://a.example/", "https://b.example/", "https://c.example/",
    "https://d.example/", "https://e.example/", "https://f.example/"
  ]));

  assert.strictEqual(
    assessLinkMemoShrink(remote, dataset(group("g1", [
      "https://a.example/", "https://b.example/", "https://c.example/",
      "https://d.example/", "https://e.example/"
    ]))),
    null,
    "1件消したのは普通の編集"
  );

  const halved = assessLinkMemoShrink(remote, dataset(group("g1", [
    "https://a.example/", "https://b.example/"
  ])));
  assert.strictEqual(halved.reason, "shrink", "半分以上減れば確認する");
  assert.strictEqual(halved.removed, 4, "減った件数を伝える");
  assert.strictEqual(
    describeLinkMemoShrink(halved),
    "リンクが6件から2件へ4件減ります。",
    "警告文は両方の件数を出す"
  );

  const emptied = assessLinkMemoShrink(remote, dataset());
  assert.strictEqual(emptied.reason, "empty", "空になったのは最も危ない形");

  const grouped = assessLinkMemoShrink(
    dataset(group("g1", ["https://a.example/"]), group("g2", ["https://b.example/"]),
      group("g3", ["https://c.example/"]), group("g4", ["https://d.example/"])),
    dataset(group("g1", ["https://a.example/", "https://b.example/",
      "https://c.example/", "https://d.example/"]))
  );
  assert.strictEqual(grouped.reason, "groups", "リンクが残っていてもグループの激減は確認する");
  assert.strictEqual(assessLinkMemoShrink(dataset(), dataset()), null, "守るものが無ければ警告しない");
}

// --- history ---------------------------------------------------------------

{
  const date = new Date("2026-08-12T11:52:12Z");
  const name = createLinkMemoHistoryName(7, "auto", { groups: 3, bookmarks: 12, domains: 8 }, date);
  assert.strictEqual(name, "20260812T115212Z-r000007-c3.12.8-auto.json", "名前は時刻・版・件数の順");

  const parsed = parseLinkMemoHistoryName(name);
  assert.strictEqual(parsed.revision, 7, "版を読み戻せる");
  assert.strictEqual(parsed.label, "auto", "ラベルを読み戻せる");
  assert.deepStrictEqual(parsed.counts, { groups: 3, bookmarks: 12, domains: 8 }, "件数を読み戻せる");
  assert.strictEqual(parsed.date.toISOString(), date.toISOString(), "時刻を読み戻せる");

  const unknown = parseLinkMemoHistoryName("なにか別のファイル.json");
  assert.strictEqual(unknown.counts, null, "読めない名前でも落ちない");

  const entries = Array.from({ length: 80 }, (_unused, index) => ({
    // 直近30件のうしろに、同じ日付が複数並ぶ古い履歴を作る。
    date: new Date(Date.UTC(2026, 0, 1 + Math.floor(index / 4), 12 - (index % 4)))
  })).sort((a, b) => b.date - a.date);
  const expired = selectExpiredLinkMemoHistory(entries, { recentKeep: 30, dailyKeep: 30 });
  assert.ok(expired.length > 0, "古い履歴は間引く");
  assert.ok(
    entries.slice(0, 30).every((entry) => !expired.includes(entry)),
    "直近30件は必ず残す"
  );
  assert.strictEqual(
    selectExpiredLinkMemoHistory([{ date: null }, ...entries.slice(0, 40)]).includes(entries[35]),
    true,
    "日付ごとに1件へ絞る"
  );
  assert.strictEqual(
    selectExpiredLinkMemoHistory(entries.slice(0, 20)).length,
    0,
    "件数が少ないうちは何も消さない"
  );
}

// --- imports ---------------------------------------------------------------

{
  const current = dataset(group("g1", ["https://a.example/", "https://b.example/"]));
  const now = Date.now();

  const newer = assessLinkMemoImport({
    fileExportedAt: new Date(now).toISOString(),
    fileDataset: dataset(group("g1", ["https://a.example/", "https://b.example/", "https://c.example/"])),
    currentUpdatedAt: new Date(now - 3600 * 1000).toISOString(),
    currentDataset: current
  });
  assert.strictEqual(newer.level, "none", "新しくて増えるファイルは素直に読める");

  const older = assessLinkMemoImport({
    fileExportedAt: new Date(now - 3 * 3600 * 1000).toISOString(),
    fileDataset: dataset(group("g1", ["https://a.example/", "https://b.example/", "https://c.example/"])),
    currentUpdatedAt: new Date(now).toISOString(),
    currentDataset: current
  });
  assert.strictEqual(older.level, "danger", "件数が増えても、古いファイルは強く警告する");
  assert.strictEqual(formatLinkMemoElapsed(older.staleMs), "約3時間", "どれだけ古いかを言う");

  const undated = assessLinkMemoImport({
    fileDataset: dataset(group("g1", ["https://a.example/", "https://b.example/"])),
    currentUpdatedAt: new Date(now).toISOString(),
    currentDataset: current
  });
  assert.strictEqual(undated.comparable, false, "日時の無いファイルは新旧を判断できない");
  assert.strictEqual(undated.level, "none", "…が、件数が同じなら危険とまでは言わない");

  const drift = assessLinkMemoImport({
    fileExportedAt: new Date(now - 30 * 1000).toISOString(),
    fileDataset: current,
    currentUpdatedAt: new Date(now).toISOString(),
    currentDataset: current
  });
  assert.strictEqual(drift.level, "none", "PC間の時計のずれ程度では警告しない");
}

// --- backup files ----------------------------------------------------------

{
  assert.doesNotThrow(
    () => validateLinkMemoBackup({ version: 1, groups: [] }),
    "書式名の無い、以前のエクスポートも読める"
  );
  assert.throws(() => validateLinkMemoBackup({ format: "todo-memo", groups: [] }), /対応していない/);
  assert.throws(() => validateLinkMemoBackup({ groups: "" }), /グループのデータがありません/);
  assert.throws(() => validateLinkMemoBackup([]), /バックアップファイルではありません/);
  assert.throws(
    () => validateLinkMemoBackup({ groups: [{ bookmarks: {} }] }),
    /リンクのデータが不正です/
  );

  assert.deepStrictEqual(
    readLinkMemoCounts({ counts: { groups: 2, bookmarks: 9, domains: 4 } }),
    { groups: 2, bookmarks: 9, domains: 4 },
    "counts を持つ文書はそれを使う"
  );
  assert.deepStrictEqual(
    readLinkMemoCounts({ groups: [group("g1", ["https://a.example/"])] }),
    { groups: 1, bookmarks: 1, domains: 1 },
    "counts の無いファイルは数え直す"
  );
}

// --- bookkeeping -----------------------------------------------------------

{
  const state = { userId: "user-1", revision: 3, fingerprint: "abc", remoteUpdatedAt: "", lastSyncedAt: "" };
  assert.strictEqual(sanitizeLinkMemoSyncState(state, "user-1").revision, 3, "同じ利用者の記録は残る");
  assert.strictEqual(
    sanitizeLinkMemoSyncState(state, "user-2").revision,
    0,
    "別の利用者の記録は、この文書について何も語らない"
  );
  assert.strictEqual(sanitizeLinkMemoSyncState(null).revision, 0, "壊れた記録は初期値へ");

  assert.strictEqual(
    describeLinkMemoDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Edg/120.0"),
    "Windows / Edge",
    "どのPCが更新したか分かる程度には端末を言う"
  );
  assert.strictEqual(formatLinkMemoElapsed(30 * 1000), "1分未満");
  assert.strictEqual(formatLinkMemoElapsed(45 * 60 * 1000), "45分");
  assert.strictEqual(formatLinkMemoElapsed(3 * 24 * 3600 * 1000), "約3日");
}

console.log("cloud sync: すべてのテストに合格しました");
