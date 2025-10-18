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
        alignItems: "center",
      })
      .appendTo(tabBar);

    tabList.on("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabList.elm.scrollLeft += e.deltaY;
      }
    });

    let draggedTab = null;
    tabList.on("dragstart", (e) => {
      if (e.target.classList.contains("browser-tab")) {
        draggedTab = e.target;
        setTimeout(() => (e.target.style.opacity = "0.5"), 0);
        dragOverlay.style({ display: "block" });
      }
    });
    tabList.on("dragend", (e) => {
      if (draggedTab) {
        draggedTab.style.opacity = "1";
        draggedTab = null;
      }
      dragOverlay.style({ display: "none" });
      dropZoneContainer.style({ display: "none" });
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
      })
      .html(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
      )
      .on("click", () => createTab())
      .appendTo(tabList);

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
          if (activeTab.type === "split") {
            activeTab.pane1.iframe.elm.src =
              activeTab.pane1.history[activeTab.pane1.historyIndex];
            activeTab.pane2.iframe.elm.src =
              activeTab.pane2.history[activeTab.pane2.historyIndex];
          } else {
            activeTab.iframe.elm.src =
              activeTab.history[activeTab.historyIndex];
          }
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
            const targetIframe =
              activeTab.type === "split"
                ? activeTab.pane1.iframe
                : activeTab.iframe;
            targetIframe.attr({ src: url });
          }
        }
      });

    navToolbar.appendMany(reloadBtn, addressBar);

    const pagesContainer = new Html("div")
      .class("fg", "ovh")
      .styleJs({ position: "relative", backgroundColor: "var(--root)" })
      .appendTo(wrapper);

    const dragOverlay = new Html("div")
      .styleJs({
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        display: "none",
        zIndex: "20",
      })
      .appendTo(pagesContainer);

    const resizeOverlay = new Html("div")
      .styleJs({
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        display: "none",
        zIndex: "30", // Higher z-index to be on top of everything
        cursor: "ew-resize",
      })
      .appendTo(pagesContainer);

    let dropSide = null;
    const dropZoneContainer = new Html("div")
      .styleJs({
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        display: "none",
        pointerEvents: "none",
        zIndex: "10",
      })
      .appendTo(pagesContainer);

    const dropZoneLeft = new Html("div")
      .styleJs({
        position: "absolute",
        left: "0",
        top: "0",
        width: "50%",
        height: "100%",
        backgroundColor: "hsla(222, 80%, 40%, 0.3)",
        borderRight: "2px dashed var(--primary)",
        opacity: "0",
        transition: "opacity 0.2s",
      })
      .appendTo(dropZoneContainer);

    const dropZoneRight = new Html("div")
      .styleJs({
        position: "absolute",
        right: "0",
        top: "0",
        width: "50%",
        height: "100%",
        backgroundColor: "hsla(222, 80%, 40%, 0.3)",
        borderLeft: "2px dashed var(--primary)",
        opacity: "0",
        transition: "opacity 0.2s",
      })
      .appendTo(dropZoneContainer);

    dragOverlay.on("dragenter", (e) => {
      e.preventDefault();
      const activeTabData = tabs.get(activeTabId);
      if (
        draggedTab &&
        draggedTab.dataset.tabId !== activeTabId &&
        activeTabData?.type !== "split"
      ) {
        dropZoneContainer.style({ display: "block" });
      }
    });

    dragOverlay.on("dragleave", (e) => {
      if (e.target === dragOverlay.elm) {
        dropZoneContainer.style({ display: "none" });
        dropSide = null;
      }
    });

    dragOverlay.on("dragover", (e) => {
      e.preventDefault();
      const activeTabData = tabs.get(activeTabId);
      if (
        !draggedTab ||
        draggedTab.dataset.tabId === activeTabId ||
        activeTabData?.type === "split"
      ) {
        return;
      }

      const rect = pagesContainer.elm.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (x < rect.width / 2) {
        dropZoneLeft.style({ opacity: "1" });
        dropZoneRight.style({ opacity: "0" });
        dropSide = "left";
      } else {
        dropZoneLeft.style({ opacity: "0" });
        dropZoneRight.style({ opacity: "1" });
        dropSide = "right";
      }
    });

    dragOverlay.on("drop", (e) => {
      e.preventDefault();
      if (draggedTab && dropSide) {
        const draggedTabId = draggedTab.dataset.tabId;
        const targetTabId = activeTabId;
        const draggedTabData = tabs.get(draggedTabId);
        const targetTabData = tabs.get(targetTabId);

        if (
          draggedTabId !== targetTabId &&
          draggedTabData &&
          targetTabData &&
          targetTabData.type !== "split"
        ) {
          createSplitView(draggedTabId, targetTabId, dropSide);
        }
      }
      dragOverlay.style({ display: "none" });
      dropZoneContainer.style({ display: "none" });
      dropSide = null;
    });

    function switchTab(tabId) {
      if (activeTabId === tabId) return;

      if (activeTabId) {
        const oldTab = tabs.get(activeTabId);
        if (oldTab) {
          oldTab.tab.classOff("selected");
          oldTab.contentContainer.style({ display: "none" });
        }
      }

      const newTab = tabs.get(tabId);
      if (newTab) {
        newTab.tab.classOn("selected");
        newTab.contentContainer.style({ display: "flex" });

        if (newTab.type === "split") {
          addressBar.val("");
          MyWindow.setTitle(
            `${newTab.pane1.title} | ${
              newTab.pane2.title
            } - ${Root.Lib.getString("systemApp_Browser")}`
          );
        } else {
          addressBar.val(newTab.history[newTab.historyIndex] || "");
          MyWindow.setTitle(
            `${newTab.title} - ${Root.Lib.getString("systemApp_Browser")}`
          );
        }
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
        if (nextElement && !nextElement.contains(newTabBtn.elm)) {
          nextTabId = nextElement.dataset.tabId;
        }
      }

      tabToClose.contentContainer.cleanup();
      tabToClose.tab.cleanup();
      tabs.delete(tabId);

      if (tabs.size === 0) {
        MyWindow.close();
        return;
      }

      if (tabId === activeTabId) {
        activeTabId = null;
        const switchToId = nextTabId || tabs.keys().next().value;
        if (switchToId) {
          switchTab(switchToId);
        }
      }
    }

    function createSplitView(draggedTabId, targetTabId, side) {
      const draggedTabData = tabs.get(draggedTabId);
      const targetTabData = tabs.get(targetTabId);
      if (!draggedTabData || !targetTabData) return;

      const newTabId = targetTabId;
      const leftData = side === "left" ? draggedTabData : targetTabData;
      const rightData = side === "left" ? targetTabData : draggedTabData;

      const leftPane = targetTabData.leftPane;
      const rightPane = targetTabData.rightPane;
      const separator = targetTabData.separator;

      if (side === "left") {
        rightPane.append(targetTabData.iframe);
        leftPane.append(draggedTabData.iframe);
      } else {
        rightPane.append(draggedTabData.iframe);
      }

      leftPane.style({ flex: "1 1 0%" });
      rightPane.style({ display: "flex", flex: "1 1 0%" });
      separator.style({ display: "block" });

      const comboTabElement = targetTabData.tab;
      comboTabElement.clear();
      comboTabElement.styleJs({ gap: "4px" });

      const title1 = new Html("span").text(leftData.title).styleJs({
        flex: "1",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      });
      const titleSeparator = new Html("span")
        .text("|")
        .styleJs({ opacity: "0.5", pointerEvents: "none" });
      const title2 = new Html("span").text(rightData.title).styleJs({
        flex: "1",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      });
      const closeBtn = new Html("button")
        .class("square", "transparent")
        .styleJs({
          width: "16px",
          height: "16px",
          padding: "2px",
          marginLeft: "4px",
        })
        .html(
          `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
        )
        .on("click", (e) => closeTab(newTabId, e));

      comboTabElement.appendMany(title1, titleSeparator, title2, closeBtn);

      const newSplitData = {
        ...targetTabData,
        tab: comboTabElement,
        type: "split",
        pane1: { ...leftData, titleElm: title1 },
        pane2: { ...rightData, titleElm: title2 },
      };

      newSplitData.pane1.iframe = leftData.iframe;
      newSplitData.pane2.iframe = rightData.iframe;

      newSplitData.pane1.iframe.elm.dataset.tabId = newTabId;
      newSplitData.pane1.iframe.elm.dataset.pane = "pane1";
      newSplitData.pane2.iframe.elm.dataset.tabId = newTabId;
      newSplitData.pane2.iframe.elm.dataset.pane = "pane2";
      tabs.set(newTabId, newSplitData);

      draggedTabData.tab.cleanup();
      tabs.delete(draggedTabId);

      MyWindow.setTitle(
        `${newSplitData.pane1.title} | ${
          newSplitData.pane2.title
        } - ${Root.Lib.getString("systemApp_Browser")}`
      );
    }

    function createTab(
      url = `//${location.host}/assets/browserhp.html`,
      makeActive = true
    ) {
      const tabId = `tab-${Date.now()}`;

      const contentContainer = new Html("div")
        .class("row", "w-100", "h-100")
        .styleJs({ display: "none" })
        .appendTo(pagesContainer);

      const leftPane = new Html("div")
        .class("fg", "ovh")
        .styleJs({ position: "relative", flex: "1 1 0%" })
        .appendTo(contentContainer);

      const separator = new Html("div")
        .styleJs({
          width: "4px",
          backgroundColor: "var(--outline)",
          cursor: "ew-resize",
          flexShrink: "0",
          zIndex: "5",
          display: "none",
        })
        .appendTo(contentContainer);

      const rightPane = new Html("div")
        .class("fg", "ovh")
        .styleJs({
          position: "relative",
          display: "none",
        })
        .appendTo(contentContainer);

      // --- FIX: Attach resize logic using the reliable overlay method ---
      separator.on("mousedown", (e) => {
        e.preventDefault();
        resizeOverlay.style({ display: "block" }); // Show the overlay

        const startX = e.clientX;
        const leftInitialWidth = leftPane.elm.offsetWidth;

        function onMouseMove(moveEvent) {
          const dx = moveEvent.clientX - startX;
          const newLeftWidth = leftInitialWidth + dx;
          const totalWidth = contentContainer.elm.offsetWidth;
          if (newLeftWidth < 50 || totalWidth - newLeftWidth < 50) return;
          const newLeftFlex = newLeftWidth / totalWidth;
          leftPane.style({ flex: `${newLeftFlex} 1 0%` });
          rightPane.style({ flex: `${1 - newLeftFlex} 1 0%` });
        }

        function onMouseUp() {
          resizeOverlay.style({ display: "none" }); // Hide the overlay
          // Remove listeners from the overlay
          resizeOverlay.un("mousemove", onMouseMove);
          resizeOverlay.un("mouseup", onMouseUp);
        }

        // Attach listeners to the overlay, not the document
        resizeOverlay.on("mousemove", onMouseMove);
        resizeOverlay.on("mouseup", onMouseUp);
      });

      const iframe = new Html("iframe")
        .attr({ src: url })
        .styleJs({ width: "100%", height: "100%", border: "none" })
        .appendTo(leftPane);
      iframe.elm.dataset.tabId = tabId;

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
        contentContainer,
        iframe,
        title: "New Tab",
        history: [url],
        historyIndex: 0,
        type: "single",
        favicon: favicon,
        titleElm: title,
        leftPane,
        rightPane,
        separator,
      };
      tabs.set(tabId, tabData);

      iframe.on("load", (e) => {
        const loadedTabId = e.target.dataset.tabId;
        const loadedPaneKey = e.target.dataset.pane;
        if (!loadedTabId) return;
        const loadedTabData = tabs.get(loadedTabId);
        if (!loadedTabData) return;

        const targetData =
          loadedTabData.type === "split" && loadedPaneKey
            ? loadedTabData[loadedPaneKey]
            : loadedTabData;
        if (!targetData) return;

        let finalUrl;
        try {
          finalUrl = e.target.contentWindow.location.href;
        } catch (err) {
          finalUrl = e.target.src;
        }

        if (finalUrl !== targetData.history[targetData.historyIndex]) {
          targetData.history = targetData.history.slice(
            0,
            targetData.historyIndex + 1
          );
          targetData.history.push(finalUrl);
          targetData.historyIndex = targetData.history.length - 1;
        }

        let pageTitle = "Untitled";
        try {
          pageTitle = e.target.contentDocument.title || pageTitle;
        } catch (err) {}
        targetData.title = pageTitle;
        targetData.titleElm.text(pageTitle);

        if (activeTabId === loadedTabId) {
          if (loadedTabData.type === "split") {
            MyWindow.setTitle(
              `${loadedTabData.pane1.title} | ${
                loadedTabData.pane2.title
              } - ${Root.Lib.getString("systemApp_Browser")}`
            );
          } else {
            addressBar.val(finalUrl);
            MyWindow.setTitle(
              `${pageTitle} - ${Root.Lib.getString("systemApp_Browser")}`
            );
          }
        }

        if (targetData.favicon) {
          targetData.favicon.attr({
            src: `https://www.google.com/s2/favicons?domain=${finalUrl}&sz=16`,
          });
        }
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

    createTab();

    return Root.Lib.setupReturns(async (m) => {
      if (m?.type === "refresh") {
        Root.Lib.getString = m.data;
        const currentTab = tabs.get(activeTabId);
        if (currentTab) {
          const title =
            currentTab.type === "split"
              ? `${currentTab.pane1.title} | ${currentTab.pane2.title}`
              : currentTab.title;
          MyWindow.setTitle(
            `${title} - ${Root.Lib.getString("systemApp_Browser")}`
          );
        }
        Root.Lib.updateProcTitle(Root.Lib.getString("systemApp_Browser"));
      }
    });
  },
};
