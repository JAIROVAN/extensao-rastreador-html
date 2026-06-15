const HISTORY_KEY = "rastreadorHtml.history";
const CURRENT_CAPTURE_KEY = "rastreadorHtml.currentCaptureId";
const TRACKING_TARGET_KEY = "rastreadorHtml.trackingTarget";
const MAX_HISTORY_ITEMS = 100;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "Erro inesperado no Rastreador HTML."
      });
    });

  return true;
});

async function handleMessage(message, sender) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: "Mensagem invalida." };
  }

  if (message.type === "rastreador:startTracking") {
    return startTracking(message);
  }

  if (message.type === "rastreador:getTrackingStatus") {
    return getTrackingStatus();
  }

  if (message.type === "rastreador:captureElement") {
    return saveCapture(message.capture, sender);
  }

  if (message.type === "rastreador:getHistory") {
    return getHistoryResponse();
  }

  if (message.type === "rastreador:stopTracking") {
    return stopTracking();
  }

  if (message.type === "rastreador:trackingStoppedByPage") {
    return clearTrackingTargetFromSender(sender);
  }

  if (message.type === "rastreador:clearHistory") {
    return clearHistory();
  }

  return { ok: false, error: "Tipo de mensagem desconhecido." };
}

async function startTracking(options = {}) {
  const activeTarget = await getValidTrackingTarget();

  if (activeTarget) {
    return {
      ok: false,
      error: "O modo rastreio ja esta ativo. Interrompa o rastreamento antes de iniciar outro."
    };
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab || typeof tab.id !== "number") {
    return { ok: false, error: "Nenhuma aba ativa encontrada." };
  }

  const limitation = getInjectionLimitation(tab.url || "");

  if (limitation) {
    return { ok: false, error: limitation };
  }

  await closeResultTabs();

  const panelResult = options.skipPanelOpen
    ? { ok: true }
    : await openResultPanel(tab);

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id, allFrames: true },
      files: ["contentStyle.css"]
    });
  } catch (error) {
    return {
      ok: false,
      error: buildInjectionError(error)
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["contentScript.js"]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        window.__RastreadorHtmlTracker?.activate?.();
      }
    });

    await chrome.storage.session.set({
      [TRACKING_TARGET_KEY]: {
        tabId: tab.id,
        windowId: tab.windowId,
        url: tab.url || "",
        startedAt: new Date().toISOString()
      }
    });

    await notifyResultPage({
      type: "rastreador:trackingStarted"
    });

    return {
      ok: true,
      tabId: tab.id,
      windowId: tab.windowId,
      panelOpened: panelResult.ok,
      warning: panelResult.warning || ""
    };
  } catch (error) {
    return {
      ok: false,
      error: buildInjectionError(error)
    };
  }
}

async function getTrackingStatus() {
  const target = await getValidTrackingTarget();

  return {
    ok: true,
    isTracking: Boolean(target),
    target: target || null
  };
}

async function saveCapture(capture, sender) {
  if (!capture || typeof capture !== "object") {
    return { ok: false, error: "Captura vazia ou invalida." };
  }

  await closeResultTabs();

  const enrichedCapture = enrichCapture(capture, sender);
  const historyData = await chrome.storage.session.get(HISTORY_KEY);
  const currentHistory = Array.isArray(historyData[HISTORY_KEY])
    ? historyData[HISTORY_KEY]
    : [];
  const nextHistory = [
    toHistoryItem(enrichedCapture),
    ...currentHistory
  ].slice(0, MAX_HISTORY_ITEMS);

  await chrome.storage.session.set({
    [HISTORY_KEY]: nextHistory,
    [CURRENT_CAPTURE_KEY]: enrichedCapture.captureId
  });

  await notifyResultPage({
    type: "rastreador:historyUpdated",
    captureId: enrichedCapture.captureId
  });

  return {
    ok: true,
    captureId: enrichedCapture.captureId
  };
}

async function getHistoryResponse() {
  const data = await chrome.storage.session.get([
    HISTORY_KEY,
    CURRENT_CAPTURE_KEY
  ]);

  const history = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  const currentCaptureId = data[CURRENT_CAPTURE_KEY] || history[0]?.captureId || null;

  return {
    ok: true,
    history,
    currentCaptureId
  };
}

async function clearHistory() {
  await chrome.storage.session.set({
    [HISTORY_KEY]: [],
    [CURRENT_CAPTURE_KEY]: null
  });

  await notifyResultPage({
    type: "rastreador:historyCleared"
  });

  return { ok: true };
}

async function stopTracking() {
  const target = await getValidTrackingTarget();

  if (!target || typeof target.tabId !== "number") {
    return {
      ok: false,
      error: "Nenhuma aba em modo de rastreio foi encontrada nesta sessao."
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: target.tabId, allFrames: true },
      func: () => {
        window.__RastreadorHtmlTracker?.deactivate?.({
          notifyBackground: false
        });
      }
    });

    await chrome.storage.session.remove(TRACKING_TARGET_KEY);
    await notifyResultPage({
      type: "rastreador:trackingStopped"
    });

    return { ok: true };
  } catch (error) {
    await chrome.storage.session.remove(TRACKING_TARGET_KEY);

    return {
      ok: false,
      error: `Nao foi possivel parar o rastreio automaticamente: ${error?.message || error}`
    };
  }
}

async function clearTrackingTargetFromSender(sender) {
  const data = await chrome.storage.session.get(TRACKING_TARGET_KEY);
  const target = data[TRACKING_TARGET_KEY];
  const senderTabId = sender?.tab?.id;

  if (!target || target.tabId === senderTabId) {
    await chrome.storage.session.remove(TRACKING_TARGET_KEY);
    await notifyResultPage({
      type: "rastreador:trackingStopped"
    });
  }

  return { ok: true };
}

async function getValidTrackingTarget() {
  const data = await chrome.storage.session.get(TRACKING_TARGET_KEY);
  const target = data[TRACKING_TARGET_KEY];

  if (!target || typeof target.tabId !== "number") {
    return null;
  }

  try {
    await chrome.tabs.get(target.tabId);
    return target;
  } catch (error) {
    await chrome.storage.session.remove(TRACKING_TARGET_KEY);
    return null;
  }
}

async function closeResultTabs() {
  const resultUrl = chrome.runtime.getURL("resultado.html");
  const tabs = await chrome.tabs.query({});
  const resultTabIds = tabs
    .filter((tab) => tab.url === resultUrl || /^chrome-extension:\/\/[^/]+\/resultado\.html(?:[?#].*)?$/.test(tab.url || ""))
    .map((tab) => tab.id)
    .filter((tabId) => typeof tabId === "number");

  if (resultTabIds.length > 0) {
    await chrome.tabs.remove(resultTabIds);
  }
}

function enrichCapture(capture, sender) {
  const tabId = sender?.tab?.id ?? null;
  const frameId = typeof sender?.frameId === "number" ? sender.frameId : null;
  const frameUrl = sender?.url || null;
  const sourceTabTitle = sender?.tab?.title || capture.pageInfo?.title || "";

  return {
    ...capture,
    pageInfo: {
      ...(capture.pageInfo || {}),
      title: sourceTabTitle,
      tabId,
      frameId,
      frameUrl
    }
  };
}

function toHistoryItem(capture) {
  const bestSelector = capture.recommendedSelectors?.[0]?.selector ||
    capture.selectors?.cssShort ||
    capture.selectors?.cssById ||
    capture.selectors?.cssFullPath ||
    "";

  return {
    captureId: capture.captureId,
    capturedAt: capture.capturedAt,
    pageInfo: capture.pageInfo,
    elementSummary: {
      tagName: capture.elementInfo?.tagName || "",
      id: capture.elementInfo?.id || "",
      className: capture.elementInfo?.className || "",
      labelText: capture.labelInfo?.labelText || "",
      textPreview: capture.elementInfo?.innerText || capture.elementInfo?.textContent || "",
      elementKind: capture.elementInfo?.elementKind || "unknown"
    },
    idAnalysis: capture.idAnalysis,
    bestSelector,
    recommendedSelectors: capture.recommendedSelectors || [],
    iframeInfo: capture.iframeInfo,
    labelInfo: capture.labelInfo,
    visibilityInfo: capture.visibilityInfo,
    htmlSummary: capture.htmlSummary,
    fullData: capture
  };
}

async function openResultPanel(tab) {
  if (!chrome.sidePanel || typeof chrome.sidePanel.open !== "function") {
    return {
      ok: false,
      warning: "Este Chrome nao disponibilizou a API de barra lateral para a extensao."
    };
  }

  try {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: "resultado.html",
      enabled: true
    });

    await chrome.sidePanel.open({
      windowId: tab.windowId
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      warning: `Nao foi possivel abrir a barra lateral automaticamente: ${error?.message || error}`
    };
  }
}

async function notifyResultPage(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    // O painel pode ainda estar carregando; ele tambem le o storage ao abrir.
  }
}

function getInjectionLimitation(url) {
  if (!url) {
    return "A URL da aba ativa nao esta disponivel para injecao.";
  }

  const restrictedPrefixes = [
    "chrome://",
    "chrome-extension://",
    "edge://",
    "brave://",
    "opera://",
    "vivaldi://",
    "devtools://",
    "about:"
  ];

  if (restrictedPrefixes.some((prefix) => url.startsWith(prefix))) {
    return "O Chrome nao permite injetar extensoes nesta pagina interna do navegador.";
  }

  if (url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")) {
    return "O Chrome nao permite injetar extensoes na Chrome Web Store.";
  }

  if (/\.pdf(?:$|[?#])/i.test(url)) {
    return "PDFs internos do navegador normalmente nao permitem a injecao do Rastreador HTML.";
  }

  return "";
}

function buildInjectionError(error) {
  const detail = error?.message || String(error || "");

  if (/Cannot access|The extensions gallery cannot be scripted|chrome:|webstore/i.test(detail)) {
    return "Nao foi possivel injetar o Rastreador HTML nesta pagina. Verifique se nao e uma pagina chrome://, Chrome Web Store, PDF interno ou outro contexto protegido.";
  }

  return `Falha ao injetar o Rastreador HTML: ${detail}`;
}
