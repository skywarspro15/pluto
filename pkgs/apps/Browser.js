export default {
  name: "Browser",
  description: "Search the internet.",
  ver: "v1.6.2", // Supports minimum Core version of v1.6.2
  type: "process",
  exec: async function (Root) {
    console.log("Browser Loading...");

    const Win = (await Root.Lib.loadLibrary("WindowSystem")).win;
    const Html = Root.Lib.html;

    let MyWindow = new Win({
      title: Root.Lib.getString("systemApp_Browser"),
      pid: Root.PID,
      width: 800,
      height: 600,
      minWidth: 400,
      minHeight: 300,
      onclose: () => Root.Lib.onEnd(),
    });

    Root.Lib.setOnEnd((_) => MyWindow.close());

    const wrapper = MyWindow.window.querySelector(".win-content");
    wrapper.classList.add("col", "o-h");
    wrapper.style.padding = "0";

    let tabs = new Map();
    let activeTabId = null;

    // --- Main UI Structure ---

    const tabBar = new Html("div")
      .styleJs({
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        backgroundColor: "var(--unfocused)",
        padding: "4px 4px 0 4px",
      })
      .appendTo(wrapper);

    const tabList = new Html("div")
      .styleJs({
        display: "flex",
        flex: "1",
        overflowX: "auto",
        overflowY: "hidden",
        gap: "4px",
        alignItems: "center", // Vertically aligns tabs and the new tab button
      })
      .appendTo(tabBar);

    tabList.on("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabList.elm.scrollLeft += e.deltaY;
      }
    });

    // Drag and Drop Logic for Tabs
    let draggedTab = null;
    tabList.on("dragstart", (e) => {
      if (e.target.classList.contains("browser-tab")) {
        draggedTab = e.target;
        setTimeout(() => (e.target.style.opacity = "0.5"), 0);
      }
    });
    tabList.on("dragend", (e) => {
      if (draggedTab) {
        draggedTab.style.opacity = "1";
        draggedTab = null;
      }
    });
    tabList.on("dragover", (e) => {
      e.preventDefault();
      const afterElement = getDragAfterElement(tabList.elm, e.clientX);
      if (draggedTab) {
        if (afterElement == null) {
          tabList.elm.insertBefore(draggedTab, newTabBtn.elm);
        } else {
          tabList.elm.insertBefore(draggedTab, afterElement);
        }
      }
    });

    function getDragAfterElement(container, x) {
      const draggableElements = [
        ...container.querySelectorAll(".browser-tab:not(.dragging)"),
      ];
      return draggableElements.reduce(
        (closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = x - box.left - box.width / 2;
          if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
          } else {
            return closest;
          }
        },
        { offset: Number.NEGATIVE_INFINITY }
      ).element;
    }

    const newTabBtn = new Html("button")
      .class("square")
      .styleJs({
        flexShrink: 0,
        width: "28px",
        height: "28px",
        // Removed margin to rely on parent's gap for spacing
      })
      .html(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
      )
      .on("click", () => createTab())
      .appendTo(tabList); // Kept in tabList to be adjacent to tabs

    const navToolbar = new Html("div")
      .styleJs({
        display: "flex",
        alignItems: "center",
        padding: "4px 8px",
        gap: "8px",
        backgroundColor: "var(--header)",
        flexShrink: 0,
      })
      .appendTo(wrapper);

    const reloadBtn = new Html("button")
      .class("square", "transparent")
      .html(
        `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`
      )
      .on("click", () => {
        const activeTab = tabs.get(activeTabId);
        if (activeTab) {
          activeTab.iframe.elm.src = activeTab.history[activeTab.historyIndex];
        }
      });

    const addressBar = new Html("input")
      .attr({ type: "text", placeholder: "Search or enter address" })
      .class("fg")
      .on("keydown", (e) => {
        if (e.key === "Enter") {
          const value = e.target.value.trim();
          if (value === "") return;
          let url = value;
          if (!/^(https?:\/\/|file:\/\/|about:)/i.test(url)) {
            url = "https://" + url;
          }
          const activeTab = tabs.get(activeTabId);
          if (activeTab) {
            activeTab.iframe.attr({ src: url });
          }
        }
      });

    navToolbar.appendMany(reloadBtn, addressBar);

    const pagesContainer = new Html("div")
      .class("fg", "ovh")
      .styleJs({ position: "relative", backgroundColor: "var(--root)" })
      .appendTo(wrapper);

    // --- Helper Functions ---

    function switchTab(tabId) {
      if (activeTabId) {
        const oldTab = tabs.get(activeTabId);
        oldTab?.tab.classOff("selected");
        oldTab?.iframe.style({ display: "none" });
      }

      const newTab = tabs.get(tabId);
      if (newTab) {
        newTab.tab.classOn("selected");
        newTab.iframe.style({ display: "block" });
        addressBar.val(newTab.history[newTab.historyIndex] || "");
        MyWindow.setTitle(
          `${newTab.title} - ${Root.Lib.getString("systemApp_Browser")}`
        );
        activeTabId = tabId;
      }
    }

    function closeTab(tabId, e) {
      e.stopPropagation();

      const tabToClose = tabs.get(tabId);
      if (!tabToClose) return;

      const tabElements = Array.from(
        tabList.elm.querySelectorAll(".browser-tab")
      );
      const closingTabIndex = tabElements.findIndex(
        (el) => el === tabToClose.tab.elm
      );

      let nextTabId = null;
      if (tabId === activeTabId) {
        const nextElement =
          tabElements[closingTabIndex + 1] || tabElements[closingTabIndex - 1];
        if (nextElement) {
          nextTabId = nextElement.dataset.tabId;
        }
      }

      tabToClose.tab.cleanup();
      tabToClose.iframe.cleanup();
      tabs.delete(tabId);

      if (tabs.size === 0) {
        MyWindow.close();
        return;
      }

      if (nextTabId) {
        switchTab(nextTabId);
      }
    }

    function createTab(
      url = `//${location.host}/assets/browserhp.html`,
      makeActive = true
    ) {
      const tabId = `tab-${Date.now()}`;

      const iframe = new Html("iframe")
        .attr({ src: url })
        .styleJs({
          width: "100%",
          height: "100%",
          border: "none",
          display: "none",
        })
        .appendTo(pagesContainer);

      const tabElement = new Html("div")
        .class("browser-tab")
        .attr({ "data-tab-id": tabId, draggable: "true" })
        .styleJs({
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px",
          backgroundColor: "var(--header)",
          borderTopLeftRadius: "4px",
          borderTopRightRadius: "4px",
          maxWidth: "200px",
          minWidth: "40px",
          border: "1px solid var(--outline)",
          borderBottom: "none",
          cursor: "pointer",
        })
        .on("click", () => switchTab(tabId));

      tabList.elm.insertBefore(tabElement.elm, newTabBtn.elm);

      const favicon = new Html("img")
        .styleJs({ width: "16px", height: "16px", pointerEvents: "none" })
        .attr({ src: "./assets/icons/web.svg" });

      const title = new Html("span").text("Loading...").styleJs({
        flex: "1",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      });

      const closeBtn = new Html("button")
        .class("square", "transparent")
        .styleJs({ width: "16px", height: "16px", padding: "2px" })
        .html(
          `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
        )
        .on("click", (e) => closeTab(tabId, e));

      tabElement.appendMany(favicon, title, closeBtn);

      const tabData = {
        tab: tabElement,
        iframe,
        title: "New Tab",
        history: [],
        historyIndex: -1,
      };
      tabs.set(tabId, tabData);

      iframe.on("load", (e) => {
        let finalUrl;
        try {
          finalUrl = e.target.contentWindow.location.href;
        } catch (err) {
          finalUrl = e.target.src;
        }

        if (finalUrl !== tabData.history[tabData.historyIndex]) {
          tabData.history = tabData.history.slice(0, tabData.historyIndex + 1);
          tabData.history.push(finalUrl);
          tabData.historyIndex = tabData.history.length - 1;
        }

        let pageTitle = "Untitled";
        try {
          pageTitle = e.target.contentDocument.title || pageTitle;
        } catch (err) {
          try {
            pageTitle = new URL(finalUrl).hostname.replace("www.", "");
          } catch (urlErr) {
            pageTitle = finalUrl;
          }
        }
        tabData.title = pageTitle;
        title.text(pageTitle);

        if (activeTabId === tabId) {
          addressBar.val(finalUrl);
          MyWindow.setTitle(
            `${pageTitle} - ${Root.Lib.getString("systemApp_Browser")}`
          );
        }
        favicon.attr({
          src: `https://www.google.com/s2/favicons?domain=${finalUrl}&sz=16`,
        });
      });

      if (!document.getElementById("browser-tab-styles")) {
        new Html("style")
          .attr({ id: "browser-tab-styles" })
          .html(
            `
                .browser-tab.selected { background-color: var(--root) !important; position: relative; }
                .browser-tab.selected::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 1px; background-color: var(--root); }
            `
          )
          .appendTo("head");
      }

      if (makeActive) {
        switchTab(tabId);
      }
    }

    // --- Initial State ---
    createTab();

    // --- Process API ---
    return Root.Lib.setupReturns(async (m) => {
      if (m?.type === "refresh") {
        Root.Lib.getString = m.data;
        const currentTab = tabs.get(activeTabId);
        const title = currentTab ? currentTab.title : "";
        MyWindow.setTitle(
          `${title} - ${Root.Lib.getString("systemApp_Browser")}`
        );
        Root.Lib.updateProcTitle(Root.Lib.getString("systemApp_Browser"));
      }
    });
  },
};
