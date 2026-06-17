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
  refs.aiCompactSummaryOutput = document.getElementById("aiCompactSummaryOutput");
  refs.aiSummaryOutput = document.getElementById("aiSummaryOutput");
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
  refs.aiSummaryActions = document.querySelector(".ai-summary-actions");
  refs.reportSections = Array.from(document.querySelectorAll("[data-section]"));

  document.querySelector(".toolbar").addEventListener("click", handleToolbarClick);
  refs.sectionMenu.addEventListener("click", handleSectionMenuClick);
  refs.aiSummaryActions.addEventListener("click", handleAiSummaryCopyClick);
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
  renderAgentSummary(capture);
  renderIdAnalysis(capture.idAnalysis);
  renderRecommendedSelectors(capture);
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
  refs.aiCompactSummaryOutput.textContent = "";
  refs.aiSummaryOutput.textContent = "";
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

function renderAgentSummary(capture) {
  refs.aiCompactSummaryOutput.textContent = JSON.stringify(buildAgentSummaryCompact(capture), null, 2);
  refs.aiSummaryOutput.textContent = JSON.stringify(buildAgentSummary(capture), null, 2);
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

function renderRecommendedSelectors(capture) {
  clear(refs.recommendedSelectors);
  const items = capture?.recommendedSelectors || [];

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
    head.appendChild(createPill(selectorValidationLabel(item.validation), selectorValidationClass(item.validation)));
    const testButton = document.createElement("button");
    testButton.type = "button";
    testButton.className = "selector-test-button";
    testButton.textContent = "Copiar teste";
    testButton.addEventListener("click", () => {
      copyText(buildSelectorConsoleTestCode(capture, item), "Codigo de teste copiado.");
    });
    head.appendChild(testButton);
    wrapper.appendChild(head);

    const code = document.createElement("code");
    code.textContent = item.selector || "";
    wrapper.appendChild(code);

    const validation = document.createElement("p");
    validation.className = "selector-validation";
    validation.textContent = selectorValidationDetail(item.validation);
    wrapper.appendChild(validation);

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

function selectorValidationLabel(validation) {
  if (!validation) {
    return "nao testado";
  }

  if (!validation.tested) {
    return "erro no teste";
  }

  if (validation.isUnique || validation.returnsSingleElement) {
    return "unico";
  }

  const count = Number(validation.matchCount);

  if (count === 0) {
    return "0 matches";
  }

  if (Number.isFinite(count)) {
    return `${count} matches`;
  }

  return "nao testado";
}

function selectorValidationClass(validation) {
  if (!validation) {
    return "not-tested";
  }

  if (!validation.tested) {
    return "selector-error";
  }

  if (validation.isUnique || validation.returnsSingleElement) {
    return "unique";
  }

  const count = Number(validation.matchCount);

  if (count === 0) {
    return "zero";
  }

  return "multi";
}

function selectorValidationDetail(validation) {
  if (!validation) {
    return "Validacao: nao testado nesta captura.";
  }

  if (!validation.tested) {
    return `Validacao: falhou com ${validation.method || "metodo desconhecido"}${validation.error ? ` - ${validation.error}` : ""}.`;
  }

  const count = Number(validation.matchCount);
  const targetText = validation.containsCapturedElement ? "inclui o elemento capturado" : "nao confirmou o elemento capturado";
  const context = validation.context ? ` no contexto ${validation.context}` : "";
  const uniqueness = validation.isUnique || validation.returnsSingleElement ? "retorna um unico elemento" : "nao retorna um unico elemento";

  return `Validacao: ${validation.method || "querySelectorAll"} encontrou ${Number.isFinite(count) ? count : "?"} match(es)${context}; ${uniqueness}; ${targetText}.`;
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
    "copy-ai-summary": JSON.stringify(buildAgentSummary(capture), null, 2),
    "copy-ai-summary-compact": JSON.stringify(buildAgentSummaryCompact(capture), null, 2),
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

function handleAiSummaryCopyClick(event) {
  const button = event.target.closest("button[data-ai-summary-copy]");

  if (!button) {
    return;
  }

  const capture = appState.currentCapture;

  if (!capture) {
    setStatus("Nenhuma captura selecionada.");
    return;
  }

  const summary = button.dataset.aiSummaryCopy === "compact"
    ? buildAgentSummaryCompact(capture)
    : buildAgentSummary(capture);
  const label = button.dataset.aiSummaryCopy === "compact" ? "Resumo compacto copiado." : "Resumo completo copiado.";

  copyText(JSON.stringify(summary, null, 2), label);
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

function buildAgentSummaryCompact(capture) {
  const element = capture.elementInfo || {};
  const visibility = capture.visibilityInfo || {};
  const iframeInfo = capture.iframeInfo || {};
  const idAnalysis = capture.idAnalysis || {};
  const labelInfo = capture.labelInfo || {};
  const puppeteer = capture.puppeteerSuggestions || {};
  const capabilities = buildAutomationCapabilities(element, visibility);
  const best = capture.recommendedSelectors?.[0] || null;
  const preferredSnippet = pickPreferredPuppeteerSnippet(puppeteer, capabilities, iframeInfo);

  return pruneEmpty({
    schema: "rastreadorHtml.aiAutomationCompact.v1",
    page: {
      url: capture.pageInfo?.url || "",
      title: capture.pageInfo?.title || ""
    },
    element: {
      kind: element.elementKind || "unknown",
      tag: element.tagName || "",
      id: element.id || "",
      idStatus: idAnalysis.status || "",
      classes: limitArray(element.classList || [], 5),
      name: element.name || "",
      type: element.type || "",
      role: element.role || "",
      label: labelInfo.labelText || element.ariaLabel || element.title || element.placeholder || "",
      text: limitText(element.innerText || element.textContent || "", 100),
      state: {
        visible: Boolean(visibility.isVisible),
        inViewport: Boolean(visibility.isInViewport),
        disabled: Boolean(element.disabled || visibility.disabled),
        readOnly: Boolean(element.readOnly || visibility.readOnly)
      }
    },
    action: {
      preferred: capabilities.preferredOperation,
      canClick: capabilities.canClick,
      canFill: capabilities.canFill,
      canSelect: capabilities.canSelect,
      canReadText: capabilities.canReadText
    },
    selectors: {
      best: best ? compactSelectorRecommendation(best) : { selector: getBestSelector(capture) },
      css: getCssSelector(capture),
      xpath: getXPathSelector(capture),
      alternatives: limitArray(capture.recommendedSelectors || [], 3).map((item) => ({
        selector: item.selector || "",
        type: item.type || "",
        stability: item.stability || "",
        validation: compactSelectorValidation(item.validation),
        warning: item.warning || ""
      }))
    },
    iframe: iframeInfo.isInsideIframe
      ? {
          insideIframe: true,
          nestingLevel: Array.isArray(iframeInfo.iframePath) ? iframeInfo.iframePath.length : 0,
          path: simplifyIframePathCompact(iframeInfo.iframePath || [])
        }
      : { insideIframe: false },
    puppeteer: {
      preferredSnippet
    },
    warnings: limitArray(buildAgentWarnings(capture), 5)
  });
}

function buildAgentSummary(capture) {
  const element = capture.elementInfo || {};
  const selectors = capture.selectors || {};
  const labelInfo = capture.labelInfo || {};
  const visibility = capture.visibilityInfo || {};
  const iframeInfo = capture.iframeInfo || {};
  const idAnalysis = capture.idAnalysis || {};
  const puppeteer = capture.puppeteerSuggestions || {};
  const consoleSuggestions = buildConsoleSuggestions(capture);
  const cssSelector = getCssSelector(capture);
  const xpathSelector = getXPathSelector(capture);
  const bestRecommendedSelector = capture.recommendedSelectors?.[0] || null;
  const stableAttributes = pickAutomationAttributes(element.attributes || {});
  const capabilities = buildAutomationCapabilities(element, visibility);

  return pruneEmpty({
    schema: "rastreadorHtml.aiAutomationSummary.v1",
    captureId: capture.captureId,
    capturedAt: capture.capturedAt,
    objective: "Use este resumo para criar automacao Puppeteer para clicar, ler texto ou preencher este elemento.",
    page: {
      url: capture.pageInfo?.url || "",
      domain: capture.pageInfo?.domain || "",
      title: capture.pageInfo?.title || "",
      tabId: capture.pageInfo?.tabId ?? null,
      frameId: capture.pageInfo?.frameId ?? null,
      frameUrl: capture.pageInfo?.frameUrl || ""
    },
    element: {
      tagName: element.tagName || "",
      elementKind: element.elementKind || "unknown",
      nodeName: element.nodeName || "",
      id: element.id || "",
      idStatus: idAnalysis.status || "",
      idStabilityScore: idAnalysis.score ?? null,
      classList: limitArray(element.classList || [], 12),
      className: element.className || "",
      name: element.name || "",
      type: element.type || "",
      role: element.role || "",
      title: element.title || "",
      ariaLabel: element.ariaLabel || "",
      placeholder: element.placeholder || "",
      labelText: labelInfo.labelText || "",
      labelStrategy: labelInfo.strategy || "",
      textPreview: limitText(element.innerText || element.textContent || "", 180),
      htmlSummary: capture.htmlSummary?.openingTag || capture.htmlSummary?.summary || "",
      stableAttributes,
      state: {
        disabled: Boolean(element.disabled || visibility.disabled),
        readOnly: Boolean(element.readOnly || visibility.readOnly),
        checked: Boolean(element.checked),
        selected: Boolean(element.selected),
        isVisible: Boolean(visibility.isVisible),
        isInViewport: Boolean(visibility.isInViewport),
        isFocusable: Boolean(visibility.isFocusable)
      },
      shadowDom: element.isInsideShadowDom
        ? {
            isInsideShadowDom: true,
            mode: element.shadowRootMode || ""
          }
        : null
    },
    automationCapabilities: capabilities,
    selectors: {
      best: bestRecommendedSelector
        ? compactSelectorRecommendation(bestRecommendedSelector)
        : {
            selector: getBestSelector(capture),
            type: "css",
            warning: ""
          },
      css: cssSelector,
      xpath: xpathSelector,
      recommended: limitArray(capture.recommendedSelectors || [], 6).map(compactSelectorRecommendation),
      stableAttributeSelectors: limitArray(selectors.selectorsByStableAttributes || [], 8),
      labelSelectors: limitArray(selectors.selectorsByLabel || [], 6),
      parentContextSelectors: limitArray(selectors.selectorsByParentContext || [], 5),
      nearbyTextSelectors: limitArray(selectors.selectorsByNearbyText || [], 4),
      puppeteerCompatibleSelectors: limitArray(selectors.selectorsForPuppeteer || [], 8),
      fallbackSelectors: {
        cssFullPath: selectors.cssFullPath || "",
        xpathFull: selectors.xpathFull || "",
        warning: "Use fallback apenas se seletores estaveis falharem; caminhos absolutos podem quebrar com mudancas no DOM."
      }
    },
    iframe: {
      isInsideIframe: Boolean(iframeInfo.isInsideIframe),
      nestingLevel: Array.isArray(iframeInfo.iframePath) ? iframeInfo.iframePath.length : 0,
      pathFromTopToTargetFrame: simplifyIframePath(iframeInfo.iframePath || []),
      warnings: iframeInfo.iframeWarnings || []
    },
    puppeteerSnippets: pruneEmpty({
      click: puppeteer.click || "",
      fill: capabilities.canFill || capabilities.canSelect ? puppeteer.fill || "" : "",
      readText: puppeteer.readText || "",
      iframe: puppeteer.iframe || ""
    }),
    consoleValidation: pruneEmpty({
      querySelector: consoleSuggestions.querySelector,
      querySelectorAll: consoleSuggestions.querySelectorAll,
      xpath: consoleSuggestions.xpath
    }),
    warnings: buildAgentWarnings(capture)
  });
}

function buildAutomationCapabilities(element, visibility) {
  const kind = element.elementKind || "unknown";
  const disabled = Boolean(element.disabled || visibility.disabled);
  const readOnly = Boolean(element.readOnly || visibility.readOnly);
  const canFill = (kind === "input" || kind === "textarea") && !disabled && !readOnly;
  const canSelect = kind === "select" && !disabled;
  const canClick = !disabled && visibility.pointerEvents !== "none";
  const canReadText = true;
  const recommendedActions = [];

  if (canClick) {
    recommendedActions.push("click");
  }

  if (canFill) {
    recommendedActions.push("fillText");
  }

  if (canSelect) {
    recommendedActions.push("selectOption");
  }

  if (canReadText) {
    recommendedActions.push("readText");
  }

  return {
    canClick,
    canFill,
    canSelect,
    canReadText,
    preferredOperation: canFill ? "fillText" : canSelect ? "selectOption" : canClick ? "click" : "readText",
    recommendedActions
  };
}

function buildAgentWarnings(capture) {
  const warnings = [];
  const element = capture.elementInfo || {};
  const visibility = capture.visibilityInfo || {};
  const idAnalysis = capture.idAnalysis || {};
  const iframeInfo = capture.iframeInfo || {};

  if (!capture.recommendedSelectors?.length) {
    warnings.push("Nenhum seletor recomendado foi gerado; valide manualmente no console antes de automatizar.");
  }

  if (idAnalysis.status === "possivelmenteDinamico") {
    warnings.push("ID parece dinamico; evite usar seletor por id como principal.");
  }

  (idAnalysis.warnings || []).forEach((warning) => warnings.push(warning));

  (capture.recommendedSelectors || [])
    .slice(0, 4)
    .forEach((selector) => {
      if (selector.warning) {
        warnings.push(selector.warning);
      }
    });

  if (iframeInfo.isInsideIframe) {
    warnings.push("Elemento esta dentro de iframe; a automacao deve localizar o frame antes do seletor do elemento.");
  }

  (iframeInfo.iframeWarnings || []).forEach((warning) => warnings.push(warning));

  if (element.isInsideShadowDom) {
    warnings.push("Elemento esta em shadow DOM; Puppeteer pode exigir estrategia especifica de piercing selector ou avaliacao no shadowRoot.");
  }

  if (!visibility.isVisible) {
    warnings.push("Elemento nao esta visivel segundo computed style/rect; pode exigir scroll, espera ou outro estado da pagina.");
  }

  if (!visibility.isInViewport) {
    warnings.push("Elemento esta fora do viewport; use scrollIntoView ou espere o layout antes de interagir.");
  }

  if (visibility.disabled || element.disabled) {
    warnings.push("Elemento esta disabled; clique/preenchimento pode falhar ate ele ser habilitado.");
  }

  if (visibility.readOnly || element.readOnly) {
    warnings.push("Elemento esta readonly; preenchimento direto pode falhar.");
  }

  if (visibility.overlapWarning) {
    warnings.push(visibility.overlapWarning);
  }

  return limitArray(uniqueStrings(warnings), 12);
}

function pickAutomationAttributes(attributes) {
  const usefulNames = new Set([
    "id",
    "name",
    "type",
    "role",
    "title",
    "aria-label",
    "aria-labelledby",
    "placeholder",
    "alt",
    "href",
    "src",
    "for",
    "value"
  ]);
  const picked = {};

  Object.entries(attributes || {}).forEach(([name, value]) => {
    if (usefulNames.has(name) || name.startsWith("data-")) {
      picked[name] = limitText(value, 160);
    }
  });

  if (picked.value) {
    picked.value = "[omitido: valor do campo nao e necessario para criar automacao]";
  }

  return picked;
}

function compactSelectorRecommendation(item) {
  return {
    selector: item.selector || "",
    type: item.type || "",
    score: item.score ?? null,
    stability: item.stability || "",
    validation: compactSelectorValidation(item.validation),
    reason: item.reason || "",
    warning: item.warning || ""
  };
}

function compactSelectorValidation(validation) {
  if (!validation) {
    return null;
  }

  return pruneEmpty({
    tested: Boolean(validation.tested),
    method: validation.method || "",
    matchCount: validation.matchCount ?? null,
    isUnique: Boolean(validation.isUnique || validation.returnsSingleElement),
    containsCapturedElement: Boolean(validation.containsCapturedElement),
    error: validation.error || ""
  });
}

function simplifyIframePath(path) {
  return limitArray(path || [], 8).map((frame, index) => ({
    level: index + 1,
    frameIndex: frame.frameIndex,
    frameId: frame.frameId || "",
    frameName: frame.frameName || "",
    frameTitle: frame.frameTitle || "",
    frameSrc: limitText(frame.frameSrc || "", 180),
    frameSelector: frame.frameSelector || "",
    frameCssPath: frame.frameCssPath || "",
    frameXPath: frame.frameXPath || "",
    accessibilityStatus: frame.accessibilityStatus || ""
  }));
}

function simplifyIframePathCompact(path) {
  return limitArray(path || [], 5).map((frame, index) => ({
    level: index + 1,
    frameName: frame.frameName || "",
    frameId: frame.frameId || "",
    frameSelector: frame.frameSelector || "",
    frameSrc: limitText(frame.frameSrc || "", 100)
  }));
}

function pickPreferredPuppeteerSnippet(puppeteer, capabilities, iframeInfo) {
  if (iframeInfo?.isInsideIframe && puppeteer.iframe) {
    return puppeteer.iframe;
  }

  if ((capabilities.canFill || capabilities.canSelect) && puppeteer.fill) {
    return puppeteer.fill;
  }

  if (capabilities.canClick && puppeteer.click) {
    return puppeteer.click;
  }

  return puppeteer.readText || "";
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
          "(() => {",
          `  const element = document.querySelector(${cssLiteral});`,
          "  console.log(element);",
          "  return element;",
          "})();"
        ].join("\n")
      : "",
    querySelectorAll: cssSelector
      ? [
          "(() => {",
          `  const elements = Array.from(document.querySelectorAll(${cssLiteral}));`,
          "  console.log(elements.length, elements);",
          "  return elements;",
          "})();"
        ].join("\n")
      : "",
    xpath: xpathSelector
      ? [
          "(() => {",
          `  const xpath = ${xpathLiteral};`,
          "  const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;",
          "  console.log(element);",
          "  return element;",
          "})();"
        ].join("\n")
      : ""
  };
}

function buildSelectorConsoleTestCode(capture, item) {
  const selector = item?.selector || "";
  const isXPath = isXPathSelectorForConsole(selector, item);

  if (capture?.iframeInfo?.isInsideIframe) {
    return buildIframeSelectorConsoleTestCode(capture.iframeInfo, selector, isXPath);
  }

  return buildDocumentSelectorConsoleTestCode(selector, isXPath);
}

function buildDocumentSelectorConsoleTestCode(selector, isXPath) {
  if (!selector) {
    return "";
  }

  if (isXPath) {
    const xpathLiteral = JSON.stringify(normalizeXPathSelector(selector));

    return [
      "(() => {",
      `  const xpath = ${xpathLiteral};`,
      "  const snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);",
      "  const elements = Array.from({ length: snapshot.snapshotLength }, (_, index) => snapshot.snapshotItem(index));",
      "  console.log('matches:', elements.length, elements);",
      "  elements[0]?.scrollIntoView({ block: 'center', inline: 'center' });",
      "  return elements;",
      "})();"
    ].join("\n");
  }

  const selectorLiteral = JSON.stringify(selector);

  return [
    "(() => {",
    `  const selector = ${selectorLiteral};`,
    "  const elements = Array.from(document.querySelectorAll(selector));",
    "  console.log('matches:', elements.length, elements);",
    "  elements[0]?.scrollIntoView({ block: 'center', inline: 'center' });",
    "  return elements;",
    "})();"
  ].join("\n");
}

function buildIframeSelectorConsoleTestCode(iframeInfo, selector, isXPath) {
  if (!selector) {
    return "";
  }

  const framePath = buildConsoleFramePath(iframeInfo?.iframePath || []);

  if (!framePath.length) {
    return [
      "// O elemento foi capturado dentro de iframe, mas o caminho do iframe nao ficou disponivel.",
      "// Selecione manualmente o contexto do iframe no DevTools ou preencha framePath antes de executar.",
      buildDocumentSelectorConsoleTestCode(selector, isXPath)
    ].join("\n");
  }

  const framePathLiteral = JSON.stringify(framePath, null, 2);
  const selectorLiteral = JSON.stringify(selector);
  const normalizedSelectorLiteral = JSON.stringify(isXPath ? normalizeXPathSelector(selector) : selector);
  const finalLookup = isXPath
    ? [
        `    const xpath = ${normalizedSelectorLiteral};`,
        "    const snapshot = frameDocument.evaluate(xpath, frameDocument, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);",
        "    const elements = Array.from({ length: snapshot.snapshotLength }, (_, index) => snapshot.snapshotItem(index));"
      ]
    : [
        `    const selector = ${selectorLiteral};`,
        "    const elements = Array.from(frameDocument.querySelectorAll(selector));"
      ];

  return [
    "(() => {",
    `  const framePath = ${framePathLiteral};`,
    "",
    "  function safeQueryFrame(doc, selector) {",
    "    if (!selector) return null;",
    "    try {",
    "      return doc.querySelector(selector);",
    "    } catch (error) {",
    "      return null;",
    "    }",
    "  }",
    "",
    "  function findFrameElement(doc, frame) {",
    "    const frames = Array.from(doc.querySelectorAll('iframe, frame'));",
    "    return safeQueryFrame(doc, frame.selector) ||",
    "      safeQueryFrame(doc, frame.frameCssPath) ||",
    "      frames.find((node) => frame.id && node.id === frame.id) ||",
    "      frames.find((node) => frame.name && node.name === frame.name) ||",
    "      frames.find((node) => frame.title && node.title === frame.title) ||",
    "      frames.find((node) => frame.srcPart && node.src && node.src.includes(frame.srcPart)) ||",
    "      frames[frame.frameIndex] ||",
    "      null;",
    "  }",
    "",
    "  let frameDocument = document;",
    "",
    "  try {",
    "    for (const frame of framePath) {",
    "      const frameElement = findFrameElement(frameDocument, frame);",
    "      if (!frameElement) throw new Error('Iframe nao encontrado: ' + JSON.stringify(frame));",
    "      frameDocument = frameElement.contentDocument || frameElement.contentWindow?.document;",
    "      if (!frameDocument) throw new Error('Iframe inacessivel ou cross-origin: ' + JSON.stringify(frame));",
    "    }",
    ...finalLookup,
    "    console.log('matches:', elements.length, elements);",
    "    elements[0]?.scrollIntoView({ block: 'center', inline: 'center' });",
    "    return elements;",
    "  } catch (error) {",
    "    console.error('Falha ao testar o seletor dentro do iframe.', error);",
    "    return null;",
    "  }",
    "})();"
  ].join("\n");
}

function buildConsoleFramePath(path) {
  return (path || []).map((frame) => ({
    frameIndex: Number.isInteger(frame.frameIndex) ? frame.frameIndex : null,
    id: frame.frameId || "",
    name: frame.frameName || "",
    title: frame.frameTitle || "",
    srcPart: String(frame.frameSrc || "").slice(0, 160),
    selector: frame.frameSelector || "",
    frameCssPath: frame.frameCssPath || ""
  }));
}

function isXPathSelectorForConsole(selector, item = {}) {
  const text = String(selector || "").trim();
  return item.type === "xpath" ||
    text.startsWith("/") ||
    text.startsWith("(") ||
    text.startsWith("::-p-xpath(");
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
      `validation: ${selectorValidationDetail(item.validation)}`,
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

function limitArray(value, maxItems) {
  return Array.isArray(value) ? value.slice(0, maxItems) : [];
}

function limitText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function pruneEmpty(value) {
  if (Array.isArray(value)) {
    return value
      .map(pruneEmpty)
      .filter((item) => item !== null && item !== undefined && item !== "");
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, pruneEmpty(item)])
      .filter(([, item]) => {
        if (item === null || item === undefined || item === "") {
          return false;
        }

        if (Array.isArray(item) && item.length === 0) {
          return false;
        }

        if (typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 0) {
          return false;
        }

        return true;
      })
  );
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
