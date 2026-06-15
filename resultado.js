const appState = {
  history: [],
  currentCaptureId: null,
  currentCapture: null,
  activeSection: "summary"
};

const refs = {};
let initialized = false;
let pendingPreferredCaptureId = null;

document.addEventListener("DOMContentLoaded", () => {
  refs.captureMeta = document.getElementById("captureMeta");
  refs.statusMessage = document.getElementById("statusMessage");
  refs.captureSelect = document.getElementById("captureSelect");
  refs.summary = document.getElementById("summary");
  refs.idAnalysis = document.getElementById("idAnalysis");
  refs.recommendedSelectors = document.getElementById("recommendedSelectors");
  refs.consoleCode = document.getElementById("consoleCode");
  refs.puppeteerCode = document.getElementById("puppeteerCode");
  refs.iframeInfo = document.getElementById("iframeInfo");
  refs.labelInfo = document.getElementById("labelInfo");
  refs.visibilityInfo = document.getElementById("visibilityInfo");
  refs.attributesInfo = document.getElementById("attributesInfo");
  refs.ancestorsInfo = document.getElementById("ancestorsInfo");
  refs.childrenInfo = document.getElementById("childrenInfo");
  refs.historyList = document.getElementById("historyList");
  refs.jsonOutput = document.getElementById("jsonOutput");
  refs.sectionMenu = document.querySelector(".section-menu");
  refs.reportSections = Array.from(document.querySelectorAll("[data-section]"));

  document.querySelector(".toolbar").addEventListener("click", handleToolbarClick);
  refs.sectionMenu.addEventListener("click", handleSectionMenuClick);
  refs.captureSelect.addEventListener("change", handleCaptureSelectChange);
  refs.historyList.addEventListener("click", handleHistoryClick);
  setActiveSection(appState.activeSection);

  initialized = true;
  loadAndRender(pendingPreferredCaptureId);
  pendingPreferredCaptureId = null;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "rastreador:trackingStopped" && initialized) {
    setStatus("Modo de rastreio parado.");
  }

  if (message?.type === "rastreador:historyUpdated" || message?.type === "rastreador:historyCleared") {
    if (!initialized) {
      pendingPreferredCaptureId = message.captureId || null;
      return;
    }

    loadAndRender(message.captureId || null);
  }
});

async function loadAndRender(preferredCaptureId = null) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "rastreador:getHistory"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Falha ao carregar historico.");
    }

    appState.history = Array.isArray(response.history) ? response.history : [];
    appState.currentCaptureId = preferredCaptureId || response.currentCaptureId || appState.history[0]?.captureId || null;
    appState.currentCapture = getCurrentCapture();
    render();
  } catch (error) {
    setStatus(error?.message || "Falha ao carregar dados da extensao.");
  }
}

function getCurrentCapture() {
  const item = getCurrentHistoryItem();

  return item?.fullData || null;
}

function getCurrentHistoryItem() {
  const item = appState.history.find((historyItem) => historyItem.captureId === appState.currentCaptureId) ||
    appState.history[0] ||
    null;

  appState.currentCaptureId = item?.captureId || null;
  return item;
}

function render() {
  const capture = appState.currentCapture;
  updateButtons();

  if (!capture) {
    refs.captureMeta.textContent = "Nenhuma captura nesta sessão.";
    renderEmpty();
    return;
  }

  const element = capture.elementInfo || {};
  refs.captureMeta.textContent = `${element.tagName || "elemento"} capturado em ${formatDate(capture.capturedAt)} - ${capture.pageInfo?.url || ""}`;
  renderCaptureSelect();
  renderSummary(capture);
  renderIdAnalysis(capture.idAnalysis);
  renderRecommendedSelectors(capture.recommendedSelectors || []);
  renderConsoleCode(capture);
  renderPuppeteerCode(capture.puppeteerSuggestions || {});
  renderIframeInfo(capture.iframeInfo || {});
  renderLabelInfo(capture.labelInfo || {});
  renderKeyValueGrid(refs.visibilityInfo, objectToPairs(capture.visibilityInfo || {}));
  renderAttributes(capture.elementInfo?.attributes || {});
  renderAncestors(capture.ancestors || []);
  renderChildren(capture.directChildren || []);
  renderHistory();
  refs.jsonOutput.textContent = JSON.stringify(capture, null, 2);
  syncActiveSection();
}

function renderEmpty() {
  setEmpty(refs.summary, "Nenhuma captura disponivel.");
  setEmpty(refs.idAnalysis, "Nenhum diagnostico disponivel.");
  setEmpty(refs.recommendedSelectors, "Nenhum seletor recomendado.");
  setEmpty(refs.consoleCode, "Nenhum codigo de console disponivel.");
  setEmpty(refs.puppeteerCode, "Nenhum codigo Puppeteer disponivel.");
  setEmpty(refs.iframeInfo, "Nenhuma informacao de iframe.");
  setEmpty(refs.labelInfo, "Nenhuma label detectada.");
  setEmpty(refs.visibilityInfo, "Nenhuma informacao de visibilidade.");
  setEmpty(refs.attributesInfo, "Nenhum atributo capturado.");
  setEmpty(refs.ancestorsInfo, "Nenhum ancestral capturado.");
  setEmpty(refs.childrenInfo, "Nenhum filho direto capturado.");
  renderCaptureSelect();
  renderHistory();
  refs.jsonOutput.textContent = "";
  syncActiveSection();
}

function renderSummary(capture) {
  const element = capture.elementInfo || {};
  const page = capture.pageInfo || {};
  const label = capture.labelInfo || {};
  const bestSelector = capture.recommendedSelectors?.[0]?.selector || capture.selectors?.cssShort || "";

  renderKeyValueGrid(refs.summary, [
    ["captureId", capture.captureId],
    ["capturedAt", formatDate(capture.capturedAt)],
    ["url", page.url],
    ["title", page.title],
    ["domain", page.domain],
    ["tabId", page.tabId],
    ["frameId", page.frameId],
    ["tagName", element.tagName],
    ["elementKind", element.elementKind],
    ["id", element.id || "sem id"],
    ["className", element.className],
    ["labelText", label.labelText],
    ["bestSelector", bestSelector],
    ["textPreview", element.innerText || element.textContent],
    ["htmlSummary", capture.htmlSummary?.summary]
  ]);
}

function renderIdAnalysis(idAnalysis = {}) {
  clear(refs.idAnalysis);
  const grid = document.createElement("div");
  grid.className = "kv-grid";
  refs.idAnalysis.appendChild(grid);

  renderKeyValueGrid(grid, [
    ["id", idAnalysis.id || "ausente"],
    ["status", idAnalysis.status || ""],
    ["score", idAnalysis.score ?? ""]
  ]);

  appendListBlock(refs.idAnalysis, "Motivos", idAnalysis.reasons || []);
  appendListBlock(refs.idAnalysis, "Warnings", idAnalysis.warnings || []);
}

function renderRecommendedSelectors(items) {
  clear(refs.recommendedSelectors);

  if (!items.length) {
    setEmpty(refs.recommendedSelectors, "Nenhum seletor recomendado.");
    return;
  }

  items.forEach((item, index) => {
    const wrapper = document.createElement("article");
    wrapper.className = "selector-item";

    const head = document.createElement("div");
    head.className = "selector-head";
    head.appendChild(createPill(`#${index + 1}`));
    head.appendChild(createPill(item.type || "selector"));
    head.appendChild(createPill(`score ${item.score ?? ""}`));
    head.appendChild(createPill(item.stability || "", stabilityClass(item.stability)));
    wrapper.appendChild(head);

    const code = document.createElement("code");
    code.textContent = item.selector || "";
    wrapper.appendChild(code);

    if (item.reason) {
      const reason = document.createElement("p");
      reason.className = "muted";
      reason.textContent = item.reason;
      wrapper.appendChild(reason);
    }

    if (item.warning) {
      const warning = document.createElement("p");
      warning.className = "warning";
      warning.textContent = item.warning;
      wrapper.appendChild(warning);
    }

    refs.recommendedSelectors.appendChild(wrapper);
  });
}

function renderPuppeteerCode(suggestions) {
  clear(refs.puppeteerCode);

  const blocks = [
    ["Clique", suggestions.click],
    ["Preenchimento", suggestions.fill],
    ["Leitura de texto", suggestions.readText],
    ["XPath", suggestions.xpath],
    ["Locator", suggestions.locator],
    ["Iframe", suggestions.iframe]
  ].filter(([, code]) => Boolean(code));

  if (!blocks.length) {
    setEmpty(refs.puppeteerCode, "Nenhum codigo Puppeteer disponivel.");
    return;
  }

  blocks.forEach(([title, code]) => {
    const block = document.createElement("article");
    block.className = "code-block";

    const heading = document.createElement("h3");
    heading.textContent = title;
    block.appendChild(heading);

    const pre = document.createElement("pre");
    pre.textContent = code;
    block.appendChild(pre);
    refs.puppeteerCode.appendChild(block);
  });
}

function renderConsoleCode(capture) {
  clear(refs.consoleCode);

  const suggestions = buildConsoleSuggestions(capture);
  const blocks = [
    ["querySelector", suggestions.querySelector],
    ["querySelectorAll", suggestions.querySelectorAll],
    ["XPath no console", suggestions.xpath]
  ].filter(([, code]) => Boolean(code));

  if (!blocks.length) {
    setEmpty(refs.consoleCode, "Nenhum codigo de console disponivel.");
    return;
  }

  blocks.forEach(([title, code]) => {
    const block = document.createElement("article");
    block.className = "code-block";

    const heading = document.createElement("h3");
    heading.textContent = title;
    block.appendChild(heading);

    const pre = document.createElement("pre");
    pre.textContent = code;
    block.appendChild(pre);
    refs.consoleCode.appendChild(block);
  });
}

function renderIframeInfo(iframeInfo) {
  clear(refs.iframeInfo);

  renderKeyValueGrid(refs.iframeInfo, [
    ["isInsideIframe", iframeInfo.isInsideIframe ? "sim" : "nao"],
    ["warnings", (iframeInfo.iframeWarnings || []).join(" | ")]
  ]);

  if (!iframeInfo.isInsideIframe) {
    return;
  }

  refs.iframeInfo.appendChild(renderTable(iframeInfo.iframePath || [], [
    ["frameIndex", "frameIndex"],
    ["frameId", "frameId"],
    ["frameName", "frameName"],
    ["frameTitle", "frameTitle"],
    ["frameSrc", "frameSrc"],
    ["frameSelector", "frameSelector"],
    ["frameCssPath", "frameCssPath"],
    ["frameXPath", "frameXPath"],
    ["accessibilityStatus", "accessibilityStatus"]
  ]));
}

function renderLabelInfo(labelInfo) {
  clear(refs.labelInfo);

  renderKeyValueGrid(refs.labelInfo, [
    ["found", labelInfo.found ? "sim" : "nao"],
    ["labelText", labelInfo.labelText || ""],
    ["strategy", labelInfo.strategy || ""],
    ["confidence", labelInfo.confidence || ""],
    ["labelElementSelector", labelInfo.labelElementSelector || ""]
  ]);

  refs.labelInfo.appendChild(renderTable(labelInfo.candidates || [], [
    ["labelText", "labelText"],
    ["strategy", "strategy"],
    ["confidence", "confidence"],
    ["labelElementSelector", "labelElementSelector"],
    ["distance", "distance"]
  ]));
}

function renderAttributes(attributes) {
  const rows = Object.entries(attributes).map(([name, value]) => ({ name, value }));
  clear(refs.attributesInfo);
  refs.attributesInfo.appendChild(renderTable(rows, [
    ["name", "Atributo"],
    ["value", "Valor"]
  ]));
}

function renderAncestors(ancestors) {
  clear(refs.ancestorsInfo);
  refs.ancestorsInfo.appendChild(renderTable(ancestors, [
    ["level", "level"],
    ["tagName", "tagName"],
    ["id", "id"],
    ["classList", "classList"],
    ["principaisAtributos", "principaisAtributos"],
    ["textoResumido", "textoResumido"],
    ["selectorIndividual", "selectorIndividual"],
    ["role", "role"],
    ["elementKind", "elementKind"],
    ["stabilityHints", "stabilityHints"]
  ]));
}

function renderChildren(children) {
  clear(refs.childrenInfo);
  refs.childrenInfo.appendChild(renderTable(children, [
    ["index", "index"],
    ["tagName", "tagName"],
    ["id", "id"],
    ["classList", "classList"],
    ["principaisAtributos", "principaisAtributos"],
    ["textoResumido", "textoResumido"],
    ["selectorIndividual", "selectorIndividual"],
    ["elementKind", "elementKind"]
  ]));
}

function renderHistory() {
  clear(refs.historyList);

  if (!appState.history.length) {
    setEmpty(refs.historyList, "Historico vazio.");
    return;
  }

  appState.history.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.dataset.captureId = item.captureId;

    if (item.captureId === appState.currentCaptureId) {
      button.classList.add("active");
    }

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = `${item.elementSummary?.tagName || "elemento"} - ${item.elementSummary?.labelText || item.elementSummary?.id || item.bestSelector || "sem identificador"}`;

    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent = `${formatDate(item.capturedAt)} | ${item.pageInfo?.domain || ""} | ${item.bestSelector || ""}`;

    button.appendChild(title);
    button.appendChild(meta);
    refs.historyList.appendChild(button);
  });
}

function renderCaptureSelect() {
  clear(refs.captureSelect);

  if (!appState.history.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhuma captura";
    refs.captureSelect.appendChild(option);
    refs.captureSelect.disabled = true;
    return;
  }

  refs.captureSelect.disabled = false;

  getHistoryInCaptureOrder().forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.captureId;
    option.textContent = buildCaptureOptionLabel(item, index);
    refs.captureSelect.appendChild(option);
  });

  refs.captureSelect.value = appState.currentCaptureId || appState.history[0]?.captureId || "";
}

function getHistoryInCaptureOrder() {
  return [...appState.history].sort((a, b) => {
    const firstDate = new Date(a.capturedAt || 0).getTime();
    const secondDate = new Date(b.capturedAt || 0).getTime();
    return firstDate - secondDate;
  });
}

function buildCaptureOptionLabel(item, index) {
  const summary = item.elementSummary || {};
  const tag = summary.tagName || "elemento";
  const name = summary.labelText || summary.id || item.bestSelector || summary.textPreview || "sem identificador";
  const time = formatDate(item.capturedAt);
  return `${index + 1}. ${tag} - ${name}${time ? ` - ${time}` : ""}`;
}

function renderKeyValueGrid(container, pairs) {
  clear(container);
  container.classList.add("kv-grid");

  if (!pairs.length) {
    setEmpty(container, "Sem dados.");
    return;
  }

  pairs.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "kv-item";

    const labelElement = document.createElement("span");
    labelElement.className = "kv-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("span");
    valueElement.className = "kv-value";
    valueElement.textContent = stringifyValue(value);

    item.appendChild(labelElement);
    item.appendChild(valueElement);
    container.appendChild(item);
  });
}

function renderTable(rows, columns) {
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Sem dados.";
    return empty;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  columns.forEach(([, label]) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    columns.forEach(([key]) => {
      const td = document.createElement("td");
      td.textContent = stringifyValue(row[key]);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";
  wrapper.appendChild(table);
  return wrapper;
}

function appendListBlock(container, title, items) {
  const block = document.createElement("div");
  block.className = "kv-grid";
  const item = document.createElement("div");
  item.className = "kv-item";
  const label = document.createElement("span");
  label.className = "kv-label";
  label.textContent = title;
  const value = document.createElement("span");
  value.className = "kv-value";
  value.textContent = items.length ? items.join(" | ") : "Sem dados.";
  item.appendChild(label);
  item.appendChild(value);
  block.appendChild(item);
  container.appendChild(block);
}

function createPill(text, extraClass = "") {
  const pill = document.createElement("span");
  pill.className = `pill ${extraClass}`.trim();
  pill.textContent = text || "-";
  return pill;
}

function handleToolbarClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const capture = appState.currentCapture;

  if (action === "export-history") {
    exportHistory();
    return;
  }

  if (action === "clear-history") {
    clearHistory();
    return;
  }

  if (action === "stop-tracking") {
    stopTracking();
    return;
  }

  if (!capture) {
    setStatus("Nenhuma captura selecionada.");
    return;
  }

  const payloads = {
    "copy-json": JSON.stringify(capture, null, 2),
    "copy-best": getBestSelector(capture),
    "copy-recommended": formatRecommendedSelectors(capture.recommendedSelectors || []),
    "copy-xpath": getXPathSelector(capture),
    "copy-css": getCssSelector(capture),
    "copy-console-query": buildConsoleSuggestions(capture).querySelector,
    "copy-console-all": buildConsoleSuggestions(capture).querySelectorAll,
    "copy-console-xpath": buildConsoleSuggestions(capture).xpath,
    "copy-click": capture.puppeteerSuggestions?.click || "",
    "copy-fill": capture.puppeteerSuggestions?.fill || "",
    "copy-read": capture.puppeteerSuggestions?.readText || ""
  };

  copyText(payloads[action] || "", "Conteudo copiado.");
}

function handleSectionMenuClick(event) {
  const button = event.target.closest("button[data-section-target]");

  if (!button) {
    return;
  }

  setActiveSection(button.dataset.sectionTarget);
}

function handleCaptureSelectChange(event) {
  selectCaptureById(event.target.value);
}

function handleHistoryClick(event) {
  const button = event.target.closest("button[data-capture-id]");

  if (!button) {
    return;
  }

  selectCaptureById(button.dataset.captureId);
}

function selectCaptureById(captureId) {
  if (!captureId) {
    return;
  }

  appState.currentCaptureId = captureId;
  appState.currentCapture = getCurrentCapture();
  render();
}

function setActiveSection(sectionName) {
  appState.activeSection = sectionName || "summary";
  syncActiveSection();
}

function syncActiveSection() {
  if (!refs.reportSections || !refs.sectionMenu) {
    return;
  }

  const sectionNames = refs.reportSections.map((section) => section.dataset.section);

  if (!sectionNames.includes(appState.activeSection)) {
    appState.activeSection = sectionNames[0] || "summary";
  }

  refs.reportSections.forEach((section) => {
    const isActive = section.dataset.section === appState.activeSection;
    section.hidden = !isActive;
    section.classList.toggle("is-active", isActive);
  });

  refs.sectionMenu.querySelectorAll("button[data-section-target]").forEach((button) => {
    const isActive = button.dataset.sectionTarget === appState.activeSection;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

async function stopTracking() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "rastreador:stopTracking"
    });

    if (!response?.ok) {
      setStatus(response?.error || "Nao foi possivel parar o rastreio.");
      return;
    }

    setStatus("Modo de rastreio parado.");
  } catch (error) {
    setStatus(error?.message || "Falha ao parar o rastreio.");
  }
}

async function clearHistory() {
  if (!appState.history.length) {
    setStatus("Historico ja esta vazio.");
    return;
  }

  const confirmed = confirm("Limpar todo o historico da sessao?");

  if (!confirmed) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "rastreador:clearHistory"
  });

  if (!response?.ok) {
    setStatus(response?.error || "Falha ao limpar historico.");
    return;
  }

  await loadAndRender();
  setStatus("Historico limpo.");
}

function exportHistory() {
  if (!appState.history.length) {
    setStatus("Historico vazio.");
    return;
  }

  const blob = new Blob([JSON.stringify(appState.history, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `rastreador-html-historico-${timestamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Historico exportado.");
}

async function copyText(text, successMessage) {
  if (!text) {
    setStatus("Nao ha conteudo para copiar.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  setStatus(successMessage);
}

function getBestSelector(capture) {
  return capture.recommendedSelectors?.[0]?.selector ||
    capture.selectors?.cssShort ||
    capture.selectors?.cssById ||
    capture.selectors?.cssFullPath ||
    "";
}

function getCssSelector(capture) {
  return capture.recommendedSelectors?.find((item) => item.type === "css")?.selector ||
    capture.selectors?.cssShort ||
    capture.selectors?.cssById ||
    capture.selectors?.cssFullPath ||
    "";
}

function getXPathSelector(capture) {
  return capture.recommendedSelectors?.find((item) => item.type === "xpath")?.selector ||
    capture.selectors?.xpathByText ||
    capture.selectors?.xpathFull ||
    "";
}

function buildConsoleSuggestions(capture) {
  const cssSelector = getCssSelector(capture);
  const xpathSelector = normalizeXPathSelector(getXPathSelector(capture));
  const cssLiteral = JSON.stringify(cssSelector);
  const xpathLiteral = JSON.stringify(xpathSelector);

  return {
    querySelector: cssSelector
      ? [
          `const element = document.querySelector(${cssLiteral});`,
          "console.log(element);"
        ].join("\n")
      : "",
    querySelectorAll: cssSelector
      ? [
          `const elements = Array.from(document.querySelectorAll(${cssLiteral}));`,
          "console.log(elements.length, elements);"
        ].join("\n")
      : "",
    xpath: xpathSelector
      ? [
          `const xpath = ${xpathLiteral};`,
          "const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;",
          "console.log(element);"
        ].join("\n")
      : ""
  };
}

function normalizeXPathSelector(selector) {
  if (!selector) {
    return "";
  }

  const text = String(selector);
  const match = text.match(/^::-p-xpath\((.*)\)$/);
  return match ? match[1] : text;
}

function formatRecommendedSelectors(items) {
  return items
    .map((item, index) => [
      `${index + 1}. ${item.selector}`,
      `type: ${item.type}`,
      `score: ${item.score}`,
      `stability: ${item.stability}`,
      `reason: ${item.reason}`,
      item.warning ? `warning: ${item.warning}` : ""
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

function updateButtons() {
  const hasCapture = Boolean(appState.currentCapture);
  const hasHistory = appState.history.length > 0;

  document.querySelectorAll(".toolbar button").forEach((button) => {
    const action = button.dataset.action;

    if (action === "stop-tracking") {
      button.disabled = false;
    } else if (action === "export-history" || action === "clear-history") {
      button.disabled = !hasHistory;
    } else {
      button.disabled = !hasCapture;
    }
  });
}

function setEmpty(container, text) {
  clear(container);
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = text;
  container.appendChild(empty);
}

function setStatus(message) {
  refs.statusMessage.textContent = message || "";

  if (message) {
    window.clearTimeout(setStatus.timeoutId);
    setStatus.timeoutId = window.setTimeout(() => {
      refs.statusMessage.textContent = "";
    }, 3500);
  }
}

function clear(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function objectToPairs(object) {
  return Object.entries(object || {});
}

function stringifyValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item)).join(" | ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function stabilityClass(stability) {
  if (stability === "alta") {
    return "high";
  }

  if (stability === "média") {
    return "medium";
  }

  if (stability === "baixa") {
    return "low";
  }

  return "";
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium"
    }).format(new Date(value));
  } catch (error) {
    return String(value);
  }
}
