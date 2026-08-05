(function () {
  "use strict";

  const Store = globalThis.LinkMemoStore;
  const LAST_GROUP_KEY = "linkMemoLastGroupId";
  let data = null;
  let toastTimer = null;

  const elements = {
    groups: document.querySelector("#groups"),
    emptyState: document.querySelector("#emptyState"),
    groupCount: document.querySelector("#groupCount"),
    bookmarkCount: document.querySelector("#bookmarkCount"),
    openAll: document.querySelector("#openAll"),
    openOptions: document.querySelector("#openOptions"),
    addCurrent: document.querySelector("#addCurrent"),
    emptyAddCurrent: document.querySelector("#emptyAddCurrent"),
    addDialog: document.querySelector("#addDialog"),
    addForm: document.querySelector("#addForm"),
    cancelAdd: document.querySelector("#cancelAdd"),
    currentTitle: document.querySelector("#currentTitle"),
    currentUrl: document.querySelector("#currentUrl"),
    currentGroup: document.querySelector("#currentGroup"),
    addError: document.querySelector("#addError"),
    openAllDialog: document.querySelector("#openAllDialog"),
    openAllConfirmText: document.querySelector("#openAllConfirmText"),
    cancelOpenAll: document.querySelector("#cancelOpenAll"),
    confirmOpenAll: document.querySelector("#confirmOpenAll"),
    toast: document.querySelector("#toast"),
    appVersion: document.querySelector("#appVersion")
  };

  function faviconUrl(url) {
    return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`;
  }

  function hostFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  function createBookmarkRow(bookmark) {
    const item = document.createElement("li");
    item.className = "bookmark-item";

    const link = document.createElement("a");
    link.className = "bookmark-link";
    link.href = bookmark.url;
    link.title = `${bookmark.title}\n${bookmark.url}`;
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await chrome.tabs.create({ url: bookmark.url, active: true });
    });

    const iconWrap = document.createElement("span");
    iconWrap.className = "favicon-wrap";
    const icon = document.createElement("img");
    icon.className = "favicon";
    icon.src = faviconUrl(bookmark.url);
    icon.alt = "";
    icon.addEventListener("error", () => {
      icon.style.display = "none";
      iconWrap.textContent = "↗";
    });
    iconWrap.append(icon);

    const copy = document.createElement("span");
    copy.className = "bookmark-copy";
    const title = document.createElement("span");
    title.className = "bookmark-title";
    title.textContent = bookmark.title;
    const host = document.createElement("span");
    host.className = "bookmark-host";
    host.textContent = hostFromUrl(bookmark.url);
    copy.append(title, host);

    const arrow = document.createElement("span");
    arrow.className = "launch-arrow";
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");

    link.append(iconWrap, copy, arrow);
    item.append(link);
    return item;
  }

  function createGroupCard(group) {
    const card = document.createElement("article");
    card.className = `group-card${group.collapsed ? " is-collapsed" : ""}`;
    card.dataset.groupId = group.id;
    card.dataset.color = group.color;

    const header = document.createElement("div");
    header.className = "group-header";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "group-toggle";
    toggle.setAttribute("aria-expanded", String(!group.collapsed));
    toggle.setAttribute("aria-label", `${group.name}を${group.collapsed ? "展開" : "折りたたむ"}`);

    const emoji = document.createElement("span");
    emoji.className = "group-emoji";
    emoji.textContent = group.emoji;

    const nameWrap = document.createElement("span");
    nameWrap.className = "group-name-wrap";
    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = group.name;
    const meta = document.createElement("span");
    meta.className = "group-meta";
    meta.textContent = `${group.bookmarks.length}件のリンク`;
    nameWrap.append(name, meta);

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.setAttribute("aria-hidden", "true");
    toggle.append(emoji, nameWrap, chevron);

    const open = document.createElement("button");
    open.type = "button";
    open.className = "group-open";
    open.textContent = "まとめて開く";
    open.disabled = group.bookmarks.length === 0;
    open.addEventListener("click", () => openBookmarks(group.bookmarks, group.name));

    header.append(toggle, open);
    card.append(header);

    const list = document.createElement("ul");
    list.className = "bookmark-list";
    if (group.bookmarks.length) {
      group.bookmarks.forEach((bookmark) => list.append(createBookmarkRow(bookmark)));
    } else {
      const empty = document.createElement("li");
      empty.className = "group-empty";
      empty.textContent = "このグループにはまだリンクがありません";
      list.append(empty);
    }
    card.append(list);

    toggle.addEventListener("click", async () => {
      group.collapsed = !group.collapsed;
      await Store.save(data);
      render();
    });

    return card;
  }

  function renderVersion() {
    const version = chrome.runtime?.getManifest?.().version || "0.0.0";
    elements.appVersion.textContent = `v${version}`;
  }

  function render() {
    const bookmarks = Store.getAllBookmarks(data);
    elements.groupCount.textContent = String(data.groups.length);
    elements.bookmarkCount.textContent = String(bookmarks.length);
    elements.openAll.disabled = bookmarks.length === 0;
    elements.addCurrent.disabled = data.groups.length === 0;
    elements.groups.replaceChildren(...data.groups.map(createGroupCard));
    elements.groups.hidden = bookmarks.length === 0;
    elements.emptyState.hidden = bookmarks.length !== 0;
  }

  function uniqueBookmarks(bookmarks) {
    return [...new Map(bookmarks.map((bookmark) => [bookmark.url, bookmark])).values()];
  }

  async function openBookmarks(bookmarks, label) {
    const unique = uniqueBookmarks(bookmarks);
    if (!unique.length) return;

    elements.openAll.disabled = true;

    try {
      const createdTabs = [];
      for (const bookmark of unique) {
        createdTabs.push(await chrome.tabs.create({ url: bookmark.url, active: false }));
      }
      if (createdTabs[0]?.id != null && typeof chrome.tabs.update === "function") {
        await chrome.tabs.update(createdTabs[0].id, { active: true });
      }
      showToast(`${label}：${unique.length}件のタブを開きました`);
    } catch {
      showToast("一部のタブを開けませんでした");
    } finally {
      elements.openAll.disabled = false;
    }
  }

  function showOpenAllDialog() {
    const count = uniqueBookmarks(Store.getAllBookmarks(data)).length;
    if (!count) return;

    elements.openAllConfirmText.textContent =
      `登録されている${count}件のタブを一度に開きます。` +
      "開いたタブは自動では閉じません。よろしいですか？";
    elements.openAllDialog.showModal();
  }

  async function confirmOpenAll() {
    elements.openAllDialog.close();
    await openBookmarks(Store.getAllBookmarks(data), "すべてのタブ");
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
  }

  async function showAddDialog() {
    elements.addError.textContent = "";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = Store.normalizeUrl(tab && tab.url);

    if (!url) {
      showToast("このページは登録できません");
      return;
    }

    elements.currentTitle.value = tab.title || hostFromUrl(url);
    elements.currentUrl.value = url;
    elements.currentGroup.replaceChildren(
      ...data.groups.map((group) => {
        const option = document.createElement("option");
        option.value = group.id;
        option.textContent = `${group.emoji} ${group.name}`;
        return option;
      })
    );
    const stored = await chrome.storage.local.get(LAST_GROUP_KEY);
    const lastGroupExists = data.groups.some((group) => group.id === stored[LAST_GROUP_KEY]);
    if (lastGroupExists) {
      elements.currentGroup.value = stored[LAST_GROUP_KEY];
    }
    elements.addDialog.showModal();
  }

  async function handleAdd(event) {
    event.preventDefault();
    const title = elements.currentTitle.value.trim();
    const url = Store.normalizeUrl(elements.currentUrl.value);
    const group = data.groups.find((item) => item.id === elements.currentGroup.value);

    if (!title || !url || !group) {
      elements.addError.textContent = "入力内容を確認してください。";
      return;
    }

    if (group.bookmarks.some((bookmark) => bookmark.url === url)) {
      elements.addError.textContent = "このURLは追加先グループに登録済みです。";
      return;
    }

    group.bookmarks.push({
      id: Store.createId("bookmark"),
      title,
      url
    });
    group.collapsed = false;
    await chrome.storage.local.set({ [LAST_GROUP_KEY]: group.id });
    data = await Store.save(data);
    elements.addDialog.close();
    render();
    showToast(`「${group.name}」に追加しました`);
  }

  async function init() {
    renderVersion();
    data = await Store.load();
    render();

    elements.openAll.addEventListener("click", showOpenAllDialog);
    elements.cancelOpenAll.addEventListener("click", () => elements.openAllDialog.close());
    elements.confirmOpenAll.addEventListener("click", confirmOpenAll);
    elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
    elements.addCurrent.addEventListener("click", showAddDialog);
    elements.emptyAddCurrent.addEventListener("click", showAddDialog);
    elements.currentGroup.addEventListener("change", () =>
      chrome.storage.local.set({ [LAST_GROUP_KEY]: elements.currentGroup.value })
    );
    elements.cancelAdd.addEventListener("click", () => elements.addDialog.close());
    elements.addForm.addEventListener("submit", handleAdd);

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === "local" && changes[Store.STORAGE_KEY]) {
        data = Store.normalizeData(changes[Store.STORAGE_KEY].newValue);
        render();
      }
    });
  }

  init().catch(() => showToast("データを読み込めませんでした"));
})();
