(function () {
  "use strict";

  const Store = globalThis.LinkMemoStore;
  const ICONS = [
    { emoji: "☀️", label: "朝" },
    { emoji: "📌", label: "ピン" },
    { emoji: "💼", label: "仕事" },
    { emoji: "🧭", label: "ナビゲーション" },
    { emoji: "📊", label: "データ" },
    { emoji: "✉️", label: "メール" },
    { emoji: "👥", label: "チーム" },
    { emoji: "🎓", label: "学習" },
    { emoji: "🛠️", label: "ツール" },
    { emoji: "🚀", label: "プロジェクト" },
    { emoji: "📅", label: "カレンダー" },
    { emoji: "✅", label: "タスク" },
    { emoji: "📝", label: "メモ" },
    { emoji: "📁", label: "ファイル" },
    { emoji: "💻", label: "システム" },
    { emoji: "🌐", label: "Web" },
    { emoji: "🔗", label: "リンク" },
    { emoji: "🔍", label: "検索" },
    { emoji: "📣", label: "お知らせ" },
    { emoji: "💡", label: "アイデア" },
    { emoji: "🏠", label: "ホーム" },
    { emoji: "🏢", label: "社内" },
    { emoji: "☕", label: "休憩" },
    { emoji: "🔒", label: "セキュリティ" },
    { emoji: "☎️", label: "連絡" },
    { emoji: "🧪", label: "テスト" },
    { emoji: "💰", label: "会計" },
    { emoji: "📈", label: "レポート" },
    { emoji: "🎯", label: "目標" },
    { emoji: "⭐", label: "お気に入り" }
  ];
  const COLORS = ["blue", "lightblue", "purple", "green", "yellow", "orange", "pink", "black"];
  const COLOR_LABELS = {
    blue: "青",
    lightblue: "水色",
    purple: "紫",
    green: "緑",
    yellow: "黄色",
    orange: "オレンジ",
    pink: "ピンク",
    black: "黒"
  };
  let data = null;
  let toastTimer = null;
  let confirmAction = null;

  const elements = {
    groupList: document.querySelector("#groupList"),
    groupCount: document.querySelector("#groupCount"),
    bookmarkCount: document.querySelector("#bookmarkCount"),
    domainCount: document.querySelector("#domainCount"),
    saveStatus: document.querySelector("#saveStatus"),
    addGroup: document.querySelector("#addGroup"),
    exportData: document.querySelector("#exportData"),
    importData: document.querySelector("#importData"),
    groupDialog: document.querySelector("#groupDialog"),
    groupForm: document.querySelector("#groupForm"),
    groupDialogTitle: document.querySelector("#groupDialogTitle"),
    groupId: document.querySelector("#groupId"),
    groupName: document.querySelector("#groupName"),
    emojiOptions: document.querySelector("#emojiOptions"),
    colorOptions: document.querySelector("#colorOptions"),
    groupError: document.querySelector("#groupError"),
    bookmarkDialog: document.querySelector("#bookmarkDialog"),
    bookmarkForm: document.querySelector("#bookmarkForm"),
    bookmarkDialogTitle: document.querySelector("#bookmarkDialogTitle"),
    bookmarkId: document.querySelector("#bookmarkId"),
    bookmarkGroupId: document.querySelector("#bookmarkGroupId"),
    bookmarkTitle: document.querySelector("#bookmarkTitle"),
    bookmarkUrl: document.querySelector("#bookmarkUrl"),
    bookmarkError: document.querySelector("#bookmarkError"),
    confirmDialog: document.querySelector("#confirmDialog"),
    confirmTitle: document.querySelector("#confirmTitle"),
    confirmText: document.querySelector("#confirmText"),
    toast: document.querySelector("#toast")
  };

  function faviconUrl(url) {
    return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`;
  }

  function setSaving(isSaving) {
    elements.saveStatus.classList.toggle("is-saving", isSaving);
    elements.saveStatus.lastChild.textContent = isSaving ? " 保存中…" : " 保存済み";
  }

  async function persist(message) {
    setSaving(true);
    data = await Store.save(data);
    render();
    setSaving(false);
    if (message) showToast(message);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
  }

  function optionButton(label, title, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `icon-button ${className}`.trim();
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", onClick);
    return button;
  }

  function editButton(title, onClick) {
    const button = optionButton("", title, onClick, "action-edit");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-10.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-2.13Z"
    );
    icon.append(path);

    const label = document.createElement("span");
    label.textContent = "編集";
    button.append(icon, label);
    return button;
  }

  function moveItem(array, index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= array.length) return false;
    [array[index], array[nextIndex]] = [array[nextIndex], array[index]];
    return true;
  }

  function createBookmarkRow(group, bookmark, bookmarkIndex) {
    const row = document.createElement("li");
    row.className = "editor-bookmark";

    const iconWrap = document.createElement("span");
    iconWrap.className = "editor-favicon";
    const icon = document.createElement("img");
    icon.src = faviconUrl(bookmark.url);
    icon.alt = "";
    icon.addEventListener("error", () => {
      icon.style.display = "none";
      iconWrap.textContent = "↗";
    });
    iconWrap.append(icon);

    const copy = document.createElement("div");
    copy.className = "editor-bookmark-copy";
    const titleLine = document.createElement("div");
    titleLine.className = "editor-bookmark-title-line";
    const kind = document.createElement("span");
    kind.className = "editor-link-kind";
    kind.textContent = "LINK";
    kind.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "editor-bookmark-title";
    title.textContent = bookmark.title;
    const url = document.createElement("span");
    url.className = "editor-bookmark-url";
    url.textContent = bookmark.url;
    titleLine.append(kind, title);
    copy.append(titleLine, url);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const up = optionButton("⬆️", "ひとつ上へ", async () => {
      if (moveItem(group.bookmarks, bookmarkIndex, -1)) await persist();
    }, "action-move");
    up.disabled = bookmarkIndex === 0;
    const down = optionButton("⬇️", "ひとつ下へ", async () => {
      if (moveItem(group.bookmarks, bookmarkIndex, 1)) await persist();
    }, "action-move");
    down.disabled = bookmarkIndex === group.bookmarks.length - 1;
    const edit = editButton("リンクを編集", () => showBookmarkDialog(group.id, bookmark));
    const remove = optionButton("×", "リンクを削除", () => {
      confirmDelete(
        "リンクを削除しますか？",
        `「${bookmark.title}」を削除します。この操作は取り消せません。`,
        async () => {
          group.bookmarks = group.bookmarks.filter((item) => item.id !== bookmark.id);
          await persist("リンクを削除しました");
        }
      );
    }, "action-delete");
    actions.append(up, down, edit, remove);

    row.append(iconWrap, copy, actions);
    return row;
  }

  function createGroup(group, groupIndex) {
    const article = document.createElement("article");
    article.className = "editor-group";
    article.dataset.color = group.color;

    const header = document.createElement("header");
    header.className = "editor-group-header";

    const emoji = document.createElement("div");
    emoji.className = "editor-emoji";
    emoji.textContent = group.emoji;

    const titleWrap = document.createElement("div");
    titleWrap.className = "editor-group-title";
    const kind = document.createElement("span");
    kind.className = "editor-group-kind";
    kind.textContent = "GROUP";
    kind.setAttribute("aria-hidden", "true");
    const title = document.createElement("h3");
    title.textContent = group.name;
    const meta = document.createElement("p");
    meta.textContent = `${group.bookmarks.length}件のリンク`;
    titleWrap.append(kind, title, meta);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "small-button accent";
    add.textContent = "＋ リンク追加";
    add.addEventListener("click", () => showBookmarkDialog(group.id));

    const up = optionButton("⬆️", "グループをひとつ上へ", async () => {
      if (moveItem(data.groups, groupIndex, -1)) await persist();
    }, "action-move");
    up.disabled = groupIndex === 0;
    const down = optionButton("⬇️", "グループをひとつ下へ", async () => {
      if (moveItem(data.groups, groupIndex, 1)) await persist();
    }, "action-move");
    down.disabled = groupIndex === data.groups.length - 1;
    const edit = editButton("グループを編集", () => showGroupDialog(group));
    const remove = optionButton("×", "グループを削除", () => {
      const suffix = group.bookmarks.length
        ? `登録されている${group.bookmarks.length}件のリンクも削除されます。`
        : "この操作は取り消せません。";
      confirmDelete("グループを削除しますか？", `「${group.name}」を削除します。${suffix}`, async () => {
        data.groups = data.groups.filter((item) => item.id !== group.id);
        await persist("グループを削除しました");
      });
    }, "action-delete");
    actions.append(add, up, down, edit, remove);

    header.append(emoji, titleWrap, actions);
    article.append(header);

    if (group.bookmarks.length) {
      const list = document.createElement("ul");
      list.className = "editor-bookmarks";
      group.bookmarks.forEach((bookmark, index) => list.append(createBookmarkRow(group, bookmark, index)));
      article.append(list);
    } else {
      const empty = document.createElement("div");
      empty.className = "editor-empty";
      empty.textContent = "リンクはまだありません。「リンク追加」から登録できます。";
      article.append(empty);
    }

    return article;
  }

  function render() {
    const bookmarks = Store.getAllBookmarks(data);
    const domains = new Set(
      bookmarks.map((bookmark) => {
        try {
          return new URL(bookmark.url).hostname;
        } catch {
          return "";
        }
      }).filter(Boolean)
    );
    elements.groupCount.textContent = String(data.groups.length);
    elements.bookmarkCount.textContent = String(bookmarks.length);
    elements.domainCount.textContent = String(domains.size);

    if (data.groups.length) {
      elements.groupList.replaceChildren(...data.groups.map(createGroup));
    } else {
      const empty = document.createElement("div");
      empty.className = "manager-empty";
      empty.textContent = "グループがありません。「新しいグループ」から作成してください。";
      elements.groupList.replaceChildren(empty);
    }
  }

  function buildChoiceControls() {
    elements.emojiOptions.replaceChildren(
      ...ICONS.map((icon, index) => {
        const label = document.createElement("label");
        label.className = "emoji-option";
        label.title = icon.label;
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "emoji";
        input.value = icon.emoji;
        input.setAttribute("aria-label", icon.label);
        input.checked = index === 0;
        const visual = document.createElement("span");
        visual.textContent = icon.emoji;
        label.append(input, visual);
        return label;
      })
    );

    elements.colorOptions.replaceChildren(
      ...COLORS.map((color, index) => {
        const label = document.createElement("label");
        label.className = "color-option";
        label.dataset.color = color;
        label.title = COLOR_LABELS[color];
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "color";
        input.value = color;
        input.setAttribute("aria-label", COLOR_LABELS[color]);
        input.checked = index === 0;
        const visual = document.createElement("span");
        visual.setAttribute("aria-hidden", "true");
        label.append(input, visual);
        return label;
      })
    );
  }

  function showGroupDialog(group = null) {
    elements.groupForm.reset();
    elements.groupError.textContent = "";
    elements.groupId.value = group ? group.id : "";
    elements.groupName.value = group ? group.name : "";
    elements.groupDialogTitle.textContent = group ? "グループを編集" : "新しいグループ";
    const emoji = group ? group.emoji : ICONS[0].emoji;
    const color = group ? group.color : COLORS[0];
    const emojiInput = elements.groupForm.querySelector(`input[name="emoji"][value="${CSS.escape(emoji)}"]`);
    const colorInput = elements.groupForm.querySelector(`input[name="color"][value="${color}"]`);
    if (emojiInput) emojiInput.checked = true;
    if (colorInput) colorInput.checked = true;
    elements.groupDialog.showModal();
    elements.groupName.focus();
  }

  async function saveGroup(event) {
    event.preventDefault();
    const id = elements.groupId.value;
    const name = elements.groupName.value.trim();
    const emoji = elements.groupForm.querySelector('input[name="emoji"]:checked')?.value || "📌";
    const color = elements.groupForm.querySelector('input[name="color"]:checked')?.value || "blue";

    if (!name) {
      elements.groupError.textContent = "グループ名を入力してください。";
      return;
    }

    if (id) {
      const group = data.groups.find((item) => item.id === id);
      if (!group) return;
      Object.assign(group, { name, emoji, color });
    } else {
      data.groups.push({
        id: Store.createId("group"),
        name,
        emoji,
        color,
        collapsed: false,
        bookmarks: []
      });
    }

    elements.groupDialog.close();
    await persist(id ? "グループを更新しました" : "グループを追加しました");
  }

  function showBookmarkDialog(groupId, bookmark = null) {
    elements.bookmarkForm.reset();
    elements.bookmarkError.textContent = "";
    elements.bookmarkGroupId.replaceChildren(
      ...data.groups.map((group) => {
        const option = document.createElement("option");
        option.value = group.id;
        option.textContent = `${group.emoji} ${group.name}`;
        return option;
      })
    );
    elements.bookmarkGroupId.value = groupId;
    elements.bookmarkId.value = bookmark ? bookmark.id : "";
    elements.bookmarkTitle.value = bookmark ? bookmark.title : "";
    elements.bookmarkUrl.value = bookmark ? bookmark.url : "";
    elements.bookmarkDialogTitle.textContent = bookmark ? "リンクを編集" : "リンクを追加";
    elements.bookmarkDialog.showModal();
    elements.bookmarkTitle.focus();
  }

  async function saveBookmark(event) {
    event.preventDefault();
    const targetGroup = data.groups.find((item) => item.id === elements.bookmarkGroupId.value);
    const id = elements.bookmarkId.value;
    const title = elements.bookmarkTitle.value.trim();
    const url = Store.normalizeUrl(elements.bookmarkUrl.value);

    if (!targetGroup || !title || !url) {
      elements.bookmarkError.textContent = "タイトルと有効なWebページのURLを入力してください。";
      return;
    }

    const duplicate = targetGroup.bookmarks.some((item) => item.url === url && item.id !== id);
    if (duplicate) {
      elements.bookmarkError.textContent = id
        ? "このURLは移動先グループに登録済みです。"
        : "このURLは同じグループに登録済みです。";
      return;
    }

    let message = "リンクを追加しました";
    if (id) {
      const sourceGroup = data.groups.find((group) =>
        group.bookmarks.some((item) => item.id === id)
      );
      const bookmark = sourceGroup?.bookmarks.find((item) => item.id === id);
      if (!sourceGroup || !bookmark) return;

      if (sourceGroup.id === targetGroup.id) {
        Object.assign(bookmark, { title, url });
        message = "リンクを更新しました";
      } else {
        sourceGroup.bookmarks = sourceGroup.bookmarks.filter((item) => item.id !== id);
        targetGroup.bookmarks.push({ ...bookmark, title, url });
        message = `リンクを「${targetGroup.name}」へ移動しました`;
      }
    } else {
      targetGroup.bookmarks.push({ id: Store.createId("bookmark"), title, url });
    }

    elements.bookmarkDialog.close();
    await persist(message);
  }

  function confirmDelete(title, text, action) {
    elements.confirmTitle.textContent = title;
    elements.confirmText.textContent = text;
    confirmAction = action;
    elements.confirmDialog.showModal();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const now = new Date();
    const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
      .join("-");
    const time = [now.getHours(), now.getMinutes()]
      .map((part) => String(part).padStart(2, "0"))
      .join("");
    anchor.href = url;
    anchor.download = `backup-ext_LinkMemo_${date}_${time}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("バックアップを書き出しました");
  }

  async function importData(event) {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());
      if (!raw || !Array.isArray(raw.groups)) throw new Error("invalid");
      data = Store.normalizeData(raw);
      await persist("バックアップを読み込みました");
    } catch {
      showToast("ファイルを読み込めませんでした");
    }
  }

  async function init() {
    buildChoiceControls();
    data = await Store.load();
    render();

    elements.addGroup.addEventListener("click", () => showGroupDialog());
    elements.groupForm.addEventListener("submit", saveGroup);
    elements.bookmarkForm.addEventListener("submit", saveBookmark);
    elements.exportData.addEventListener("click", exportData);
    elements.importData.addEventListener("change", importData);

    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close());
    });

    elements.confirmDialog.addEventListener("close", async () => {
      const action = confirmAction;
      confirmAction = null;
      if (elements.confirmDialog.returnValue === "confirm" && action) await action();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[Store.STORAGE_KEY]) {
        data = Store.normalizeData(changes[Store.STORAGE_KEY].newValue);
        render();
      }
    });
  }

  init().catch(() => showToast("データを読み込めませんでした"));
})();
