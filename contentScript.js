(() => {
  const GLOBAL_KEY = "__RastreadorHtmlTracker";
  const HIGHLIGHT_CLASS = "rastreador-html-highlight";
  const TOOLTIP_CLASS = "rastreador-html-tooltip";
  const MAX_TEXT = 220;

  if (window[GLOBAL_KEY]) {
    return;
  }

  const state = {
    active: false,
    highlight: null,
    tooltip: null,
    currentElement: null
  };

  window[GLOBAL_KEY] = {
    activate,
    deactivate,
    isActive: () => state.active
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "rastreador:activateTracking") {
      activate();
    }

    if (message?.type === "rastreador:deactivateTracking") {
      deactivate({
        notifyBackground: false
      });
    }
  });

  function activate() {
    if (state.active) {
      return;
    }

    state.active = true;
    ensureVisualNodes();
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseover", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("mousedown", blockPointerEvent, true);
    document.addEventListener("mouseup", blockPointerEvent, true);
    document.addEventListener("pointerdown", blockPointerEvent, true);
    document.addEventListener("pointerup", blockPointerEvent, true);
    window.addEventListener("keydown", handleKeyDown, true);
  }

  function deactivate(options = {}) {
    if (!state.active) {
      return;
    }

    state.active = false;
    state.currentElement = null;
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseover", handleMouseMove, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("mousedown", blockPointerEvent, true);
    document.removeEventListener("mouseup", blockPointerEvent, true);
    document.removeEventListener("pointerdown", blockPointerEvent, true);
    document.removeEventListener("pointerup", blockPointerEvent, true);
    window.removeEventListener("keydown", handleKeyDown, true);
    hideVisualNodes();

    if (options.notifyBackground !== false) {
      chrome.runtime.sendMessage({
        type: "rastreador:trackingStoppedByPage"
      }, () => {
        // A mensagem e apenas para sincronizar o estado do popup/background.
      });
    }
  }

  function ensureVisualNodes() {
    const root = document.documentElement || document.body;

    if (!root) {
      return;
    }

    if (!state.highlight || !document.contains(state.highlight)) {
      state.highlight = document.createElement("div");
      state.highlight.className = HIGHLIGHT_CLASS;
      state.highlight.hidden = true;
      root.appendChild(state.highlight);
    }

    if (!state.tooltip || !document.contains(state.tooltip)) {
      state.tooltip = document.createElement("div");
      state.tooltip.className = TOOLTIP_CLASS;
      state.tooltip.hidden = true;
      root.appendChild(state.tooltip);
    }
  }

  function hideVisualNodes() {
    if (state.highlight) {
      state.highlight.hidden = true;
    }

    if (state.tooltip) {
      state.tooltip.hidden = true;
    }
  }

  function handleMouseMove(event) {
    if (!state.active) {
      return;
    }

    const element = getElementFromEvent(event);

    if (!element || isTrackerNode(element)) {
      return;
    }

    state.currentElement = element;
    updateHighlight(element);
    updateTooltip(element, event.clientX, event.clientY);
  }

  function blockPointerEvent(event) {
    if (!state.active) {
      return;
    }

    const element = getElementFromEvent(event);

    if (element && !isTrackerNode(element)) {
      blockEvent(event);
    }
  }

  function handleClick(event) {
    if (!state.active) {
      return;
    }

    blockEvent(event);

    const element = getElementFromEvent(event) || state.currentElement;

    if (!element || isTrackerNode(element)) {
      return;
    }

    state.currentElement = element;
    updateHighlight(element);
    updateTooltip(element, event.clientX, event.clientY, "capturado");

    const capture = collectCapture(element);

    chrome.runtime.sendMessage({
      type: "rastreador:captureElement",
      capture
    }, () => {
      if (chrome.runtime.lastError) {
        updateTooltip(element, event.clientX, event.clientY, "falha ao salvar");
      }
    });
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      blockEvent(event);
      deactivate();
    }
  }

  function blockEvent(event) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function getElementFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const fromPath = path.find((node) =>
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      !isTrackerNode(node)
    );

    if (fromPath) {
      return fromPath;
    }

    let target = event.target;

    if (target?.nodeType === Node.TEXT_NODE) {
      target = target.parentElement;
    }

    if (target?.nodeType === Node.DOCUMENT_NODE) {
      return document.documentElement;
    }

    return target?.nodeType === Node.ELEMENT_NODE ? target : null;
  }

  function isTrackerNode(node) {
    return Boolean(
      node?.classList?.contains(HIGHLIGHT_CLASS) ||
      node?.classList?.contains(TOOLTIP_CLASS)
    );
  }

  function updateHighlight(element) {
    ensureVisualNodes();

    if (!state.highlight) {
      return;
    }

    const rect = element.getBoundingClientRect();
    state.highlight.hidden = false;
    state.highlight.style.top = `${Math.max(0, rect.top)}px`;
    state.highlight.style.left = `${Math.max(0, rect.left)}px`;
    state.highlight.style.width = `${Math.max(1, rect.width)}px`;
    state.highlight.style.height = `${Math.max(1, rect.height)}px`;
  }

  function updateTooltip(element, clientX, clientY, suffix = "") {
    ensureVisualNodes();

    if (!state.tooltip) {
      return;
    }

    const tag = element.tagName || element.nodeName || "ELEMENT";
    const id = element.getAttribute("id");
    const className = normalizeText(element.getAttribute("class") || "", 70);
    let text = `${tag.toUpperCase()} | sem id`;

    if (id) {
      text = `${tag.toUpperCase()} | id="${truncate(id, 80)}"`;
    } else if (className) {
      text = `${tag.toUpperCase()} | class="${className}"`;
    }

    if (suffix) {
      text = `${text} | ${suffix}`;
    }

    state.tooltip.textContent = text;
    state.tooltip.hidden = false;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const preferredLeft = clientX + 12;
    const preferredTop = clientY + 14;
    const tooltipRect = state.tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, preferredLeft), Math.max(8, viewportWidth - tooltipRect.width - 8));
    const top = Math.min(Math.max(8, preferredTop), Math.max(8, viewportHeight - tooltipRect.height - 8));

    state.tooltip.style.left = `${left}px`;
    state.tooltip.style.top = `${top}px`;
  }

  function collectCapture(element) {
    const captureId = createCaptureId();
    const capturedAt = new Date().toISOString();
    const idAnalysis = analyzeId(element.getAttribute("id") || "");
    const labelInfo = collectLabelInfo(element);
    const selectors = buildSelectors(element, idAnalysis, labelInfo);
    const recommendedSelectors = buildRecommendedSelectors(element, idAnalysis, labelInfo, selectors);
    const iframeInfo = collectIframeInfo();
    const puppeteerSuggestions = buildPuppeteerSuggestions(element, recommendedSelectors, selectors, iframeInfo);

    return {
      captureId,
      capturedAt,
      pageInfo: collectPageInfo(capturedAt),
      elementInfo: collectElementInfo(element),
      idAnalysis,
      visibilityInfo: collectVisibilityInfo(element),
      labelInfo,
      selectors,
      recommendedSelectors,
      iframeInfo,
      ancestors: collectAncestors(element),
      directChildren: collectDirectChildren(element),
      puppeteerSuggestions,
      htmlSummary: buildHtmlSummary(element)
    };
  }

  function collectPageInfo(timestamp) {
    return {
      url: location.href,
      title: document.title,
      domain: location.hostname,
      timestamp,
      tabId: null
    };
  }

  function collectElementInfo(element) {
    const attributes = collectAttributes(element);
    const dataAttributes = Object.fromEntries(
      Object.entries(attributes).filter(([name]) => name.startsWith("data-"))
    );
    const rect = toPlainRect(element.getBoundingClientRect());
    const tagName = (element.tagName || "").toLowerCase();
    const rootNode = element.getRootNode?.();
    const isInsideShadowDom = typeof ShadowRoot !== "undefined" && rootNode instanceof ShadowRoot;

    return {
      tagName,
      nodeName: element.nodeName,
      id: element.getAttribute("id") || "",
      className: element.getAttribute("class") || "",
      classList: Array.from(element.classList || []),
      name: element.getAttribute("name") || "",
      type: element.getAttribute("type") || "",
      role: element.getAttribute("role") || "",
      title: element.getAttribute("title") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      placeholder: element.getAttribute("placeholder") || "",
      value: readElementValue(element),
      checked: getBooleanProperty(element, "checked"),
      selected: getBooleanProperty(element, "selected"),
      disabled: getBooleanProperty(element, "disabled"),
      readOnly: getBooleanProperty(element, "readOnly"),
      href: readUrlAttribute(element, "href"),
      src: readUrlAttribute(element, "src"),
      alt: element.getAttribute("alt") || "",
      innerText: truncate(getElementText(element, "innerText"), MAX_TEXT),
      textContent: truncate(getElementText(element, "textContent"), MAX_TEXT),
      attributes,
      dataAttributes,
      rect,
      elementKind: classifyElement(element),
      isInsideShadowDom,
      shadowRootMode: isInsideShadowDom ? rootNode.mode : ""
    };
  }

  function collectVisibilityInfo(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const width = round(rect.width);
    const height = round(rect.height);
    const isInViewport = rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left <= (window.innerWidth || document.documentElement.clientWidth);
    const hasPointerEvents = style.pointerEvents !== "none";
    const disabled = getBooleanProperty(element, "disabled");
    const readOnly = getBooleanProperty(element, "readOnly");
    const isVisible = style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 &&
      width > 0 &&
      height > 0;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = isPointInViewport(centerX, centerY)
      ? document.elementFromPoint(centerX, centerY)
      : null;
    const topElementMatches = !topElement || topElement === element || element.contains(topElement);

    return {
      isVisible,
      isInViewport,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      disabled,
      readOnly,
      width,
      height,
      top: round(rect.top),
      left: round(rect.left),
      bottom: round(rect.bottom),
      right: round(rect.right),
      position: style.position,
      zIndex: style.zIndex,
      overflow: style.overflow,
      hasPointerEvents,
      isFocusable: isFocusable(element),
      tabIndex: element.tabIndex,
      topElementMatches,
      overlapWarning: topElementMatches ? "" : "Outro elemento aparece sobre o centro do elemento capturado."
    };
  }

  function analyzeId(id) {
    if (!id) {
      return {
        id: "",
        status: "ausente",
        score: 0,
        reasons: ["Elemento sem id."],
        warnings: ["Seletores por id nao estao disponiveis."]
      };
    }

    let score = 100;
    const reasons = [];
    const warnings = [];
    const digitCount = (id.match(/\d/g) || []).length;
    const colonCount = (id.match(/:/g) || []).length;
    const alphaNumericMix = /[a-zA-Z]/.test(id) && /\d/.test(id);
    const lower = id.toLowerCase();

    if (digitCount >= 4) {
      score -= 22;
      reasons.push("Contem muitos numeros.");
    }

    if (digitCount / Math.max(id.length, 1) > 0.3) {
      score -= 18;
      reasons.push("Alta proporcao de numeros.");
    }

    if (colonCount >= 2) {
      score -= 22;
      reasons.push("Contem muitos dois-pontos.");
    }

    if (/\d+$/.test(id)) {
      score -= 14;
      reasons.push("Possui sufixo numerico.");
    }

    if (/^\d/.test(id)) {
      score -= 12;
      reasons.push("Possui prefixo numerico.");
    }

    if (id.length > 40) {
      score -= 18;
      reasons.push("Id longo demais.");
    }

    if (/(ember|react-select|generated|auto|uuid|random|guid|sap-ui|webgui|isc_|__|application-.*-iframe|^m\d+:)/i.test(id)) {
      score -= 28;
      reasons.push("Parece gerado por framework ou sistema corporativo.");
    }

    if (alphaNumericMix && /[a-zA-Z]+\d+[a-zA-Z]*\d*/.test(id)) {
      score -= 12;
      reasons.push("Mistura letras e numeros em formato pouco semantico.");
    }

    if (/[a-f0-9]{8,}-[a-f0-9-]{8,}/i.test(id) || /[a-z0-9]{12,}/i.test(id.replace(/[-_:]/g, ""))) {
      score -= 18;
      reasons.push("Tem aparencia aleatoria ou de UUID/token.");
    }

    if (/^(div|span|input|button|table|row|cell|ctrl|item)[-_]?\d+/i.test(id)) {
      score -= 12;
      reasons.push("Usa token generico com numero.");
    }

    score = Math.max(0, Math.min(100, score));
    const status = score >= 70 ? "provavelmenteFixo" : "possivelmenteDinamico";

    if (status === "provavelmenteFixo") {
      reasons.unshift("Id parece semantico e relativamente estavel.");
    } else {
      warnings.push("Evite usar este id como seletor principal sem validacao adicional.");
    }

    if (/sap|webgui|application-|M\d+:/i.test(id)) {
      warnings.push("Possivel padrao SAP/WebGUI gerado automaticamente.");
    }

    if (lower.includes("iframe")) {
      warnings.push("Id menciona iframe; valide tambem o caminho de frames.");
    }

    return {
      id,
      status,
      score,
      reasons,
      warnings
    };
  }

  function buildSelectors(element, idAnalysis, labelInfo) {
    const cssById = element.id ? `#${cssEscape(element.id)}` : "";
    const selectorsByStableAttributes = buildStableAttributeSelectors(element);
    const cssShort = buildCssShortSelector(element, idAnalysis, selectorsByStableAttributes);
    const cssFullPath = buildCssFullPath(element);
    const xpathFull = buildXPathFull(element);
    const xpathByText = buildXPathByText(element);
    const selectorsByLabel = buildLabelSelectors(element, labelInfo);
    const selectorsByNearbyText = buildNearbyTextSelectors(element, labelInfo);
    const selectorsByParentContext = buildParentContextSelectors(element);
    const selectorsForPuppeteer = unique([
      cssShort,
      ...selectorsByStableAttributes,
      ...selectorsByLabel.filter((selector) => !isXPath(selector)),
      cssFullPath,
      xpathFull ? toPuppeteerXPathSelector(xpathFull) : "",
      xpathByText ? toPuppeteerXPathSelector(xpathByText) : ""
    ].filter(Boolean));

    return {
      cssById,
      cssShort,
      cssFullPath,
      xpathFull,
      xpathByText,
      selectorsByStableAttributes,
      selectorsByLabel,
      selectorsByNearbyText,
      selectorsByParentContext,
      selectorsForPuppeteer
    };
  }

  function buildRecommendedSelectors(element, idAnalysis, labelInfo, selectors) {
    const items = [];
    const seen = new Set();

    function add(selector, type, score, stability, reason, warning = "") {
      if (!selector || seen.has(`${type}:${selector}`)) {
        return;
      }

      seen.add(`${type}:${selector}`);
      items.push({
        selector,
        type,
        score,
        stability,
        reason,
        warning
      });
    }

    if (labelInfo.found) {
      selectors.selectorsByLabel.slice(0, 3).forEach((selector, index) => {
        const score = labelInfo.confidence === "alta" ? 92 - index * 4 : 78 - index * 4;
        add(selector, isXPath(selector) ? "xpath" : "label", score, labelInfo.confidence, `Label encontrado por ${labelInfo.strategy}.`);
      });
    }

    selectors.selectorsByStableAttributes.forEach((selector, index) => {
      add(selector, "css", 90 - index * 3, index < 2 ? "alta" : "média", "Atributo semantico ou estavel encontrado.");
    });

    if (selectors.cssById && idAnalysis.status === "provavelmenteFixo") {
      add(selectors.cssById, "css", Math.max(82, idAnalysis.score), "alta", "Id analisado como provavelmente fixo.");
    }

    if (selectors.cssById && idAnalysis.status === "possivelmenteDinamico") {
      add(selectors.cssById, "css", Math.min(55, idAnalysis.score), "baixa", "Id disponivel, mas a analise indica risco de dinamismo.", "Use apenas como alternativa.");
    }

    if (selectors.cssShort) {
      add(selectors.cssShort, "css", 74, "média", "Seletor curto gerado a partir do melhor identificador disponivel.");
    }

    selectors.selectorsByParentContext.forEach((selector, index) => {
      add(selector, "parentContext", 68 - index * 3, "média", "Combina contexto de pai mais estavel com posicao relativa.");
    });

    selectors.selectorsByNearbyText.forEach((selector, index) => {
      add(selector, "text", 62 - index * 3, "média", "Usa texto proximo ao elemento capturado.", "Pode quebrar com mudanca de idioma ou texto da interface.");
    });

    if (selectors.xpathByText) {
      add(selectors.xpathByText, "xpath", 58, "média", "XPath por texto do proprio elemento.", "Pode variar com idioma, espacos ou conteudo dinamico.");
    }

    if (selectors.cssFullPath) {
      add(selectors.cssFullPath, "css", 46, "baixa", "Caminho CSS completo como alternativa.", "Fragil: depende da estrutura e de nth-of-type.");
    }

    if (selectors.xpathFull) {
      add(selectors.xpathFull, "xpath", 36, "baixa", "XPath absoluto como alternativa final.", "Fragil: qualquer mudanca estrutural pode quebrar.");
    }

    if (element.getRootNode?.() instanceof ShadowRoot) {
      items.forEach((item) => {
        item.warning = item.warning
          ? `${item.warning} Elemento esta em shadow DOM; pode exigir seletor Puppeteer com combinadores >>>.`
          : "Elemento esta em shadow DOM; pode exigir seletor Puppeteer com combinadores >>>.";
      });
    }

    return items.sort((a, b) => b.score - a.score);
  }

  function collectLabelInfo(element) {
    const candidates = [];

    function addCandidate(text, strategy, labelElement, confidence, extra = {}) {
      const labelText = normalizeText(text, 180);

      if (!labelText) {
        return;
      }

      candidates.push({
        labelText,
        strategy,
        labelElementSelector: labelElement ? buildCssFullPath(labelElement) : "",
        confidence,
        ...extra
      });
    }

    const id = element.getAttribute("id");

    if (id) {
      const labelFor = safeQuerySelector(`label[for="${cssAttributeValue(id)}"]`);
      addCandidate(labelFor?.innerText || labelFor?.textContent, "label[for]", labelFor, "alta");
    }

    const ancestralLabel = element.closest?.("label");
    addCandidate(ancestralLabel?.innerText || ancestralLabel?.textContent, "label ancestral", ancestralLabel, "alta");

    const labelledBy = element.getAttribute("aria-labelledby");

    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((labelId) => document.getElementById(labelId))
        .filter(Boolean);
      addCandidate(parts.map((node) => node.innerText || node.textContent).join(" "), "aria-labelledby", parts[0], "alta");
    }

    addCandidate(element.getAttribute("aria-label"), "aria-label", null, "alta");
    addCandidate(element.getAttribute("title"), "title", null, "média");
    addCandidate(element.getAttribute("placeholder"), "placeholder", null, "média");

    const previousText = findPreviousDomText(element);
    addCandidate(previousText.text, "texto imediatamente anterior no DOM", previousText.element, "baixa");

    const tableText = findPreviousTableText(element);
    addCandidate(tableText.text, "td/th anterior", tableText.element, "média");

    const siblingText = findPreviousSiblingText(element);
    addCandidate(siblingText.text, "irmao anterior com texto", siblingText.element, "média");

    const parentText = findParentContextText(element);
    addCandidate(parentText.text, "texto do pai proximo", parentText.element, "baixa");

    findVisualLabelCandidates(element).forEach((candidate) => {
      addCandidate(candidate.text, "texto proximo visualmente", candidate.element, candidate.confidence, {
        distance: candidate.distance
      });
    });

    const deduped = uniqueObjects(candidates, (item) => `${item.strategy}:${item.labelText}`);
    const best = deduped.sort((a, b) => confidenceScore(b.confidence) - confidenceScore(a.confidence))[0];

    return {
      found: Boolean(best),
      labelText: best?.labelText || "",
      strategy: best?.strategy || "",
      labelElementSelector: best?.labelElementSelector || "",
      confidence: best?.confidence || "baixa",
      candidates: deduped
    };
  }

  function collectIframeInfo() {
    const isInsideIframe = window.top !== window;
    const iframePath = [];
    const iframeWarnings = [];

    if (!isInsideIframe) {
      return {
        isInsideIframe: false,
        iframePath,
        iframeWarnings
      };
    }

    let currentWindow = window;
    let guard = 0;

    while (currentWindow !== currentWindow.top && guard < 10) {
      guard += 1;

      try {
        const frameElement = currentWindow.frameElement;

        if (!frameElement) {
          iframeWarnings.push("Nao foi possivel acessar window.frameElement para este nivel de iframe.");
          break;
        }

        const parentDocument = frameElement.ownerDocument;
        const frameNodes = Array.from(parentDocument.querySelectorAll("iframe, frame"));
        const frameIndex = frameNodes.indexOf(frameElement);

        iframePath.unshift({
          frameIndex,
          frameId: frameElement.getAttribute("id") || "",
          frameName: frameElement.getAttribute("name") || "",
          frameTitle: frameElement.getAttribute("title") || "",
          frameSrc: frameElement.getAttribute("src") || frameElement.src || "",
          frameSelector: buildCssShortSelector(frameElement, analyzeId(frameElement.getAttribute("id") || ""), buildStableAttributeSelectors(frameElement)),
          frameCssPath: buildCssFullPath(frameElement),
          frameXPath: buildXPathFull(frameElement),
          parentFrameIndex: null,
          accessibilityStatus: "acessivel"
        });

        currentWindow = currentWindow.parent;
      } catch (error) {
        iframeWarnings.push("Iframe cross-origin ou protegido: caminho completo pode estar indisponivel.");
        break;
      }
    }

    iframePath.forEach((frame, index) => {
      frame.parentFrameIndex = index > 0 ? iframePath[index - 1].frameIndex : null;
    });

    if (iframePath.length === 0) {
      iframeWarnings.push("O elemento esta em iframe, mas o navegador bloqueou detalhes do caminho.");
    }

    return {
      isInsideIframe: true,
      iframePath,
      iframeWarnings
    };
  }

  function collectAncestors(element) {
    const ancestors = [];
    let current = element.parentElement;
    let level = 1;

    while (current) {
      const idInfo = analyzeId(current.getAttribute("id") || "");

      ancestors.push({
        level,
        tagName: (current.tagName || "").toLowerCase(),
        id: current.getAttribute("id") || "",
        classList: Array.from(current.classList || []),
        principaisAtributos: collectPrimaryAttributes(current),
        textoResumido: truncate(getOwnAndDirectText(current), 160),
        selectorIndividual: buildCssSegment(current, idInfo),
        role: current.getAttribute("role") || "",
        elementKind: classifyElement(current),
        stabilityHints: {
          idStatus: idInfo.status,
          idScore: idInfo.score,
          stableAttributes: collectStableAttributeNames(current),
          hasSemanticText: Boolean(normalizeText(getOwnAndDirectText(current), 80))
        }
      });

      if ((current.tagName || "").toLowerCase() === "html") {
        break;
      }

      current = current.parentElement;
      level += 1;
    }

    return ancestors;
  }

  function collectDirectChildren(element) {
    return Array.from(element.children || []).map((child, index) => ({
      index,
      tagName: (child.tagName || "").toLowerCase(),
      id: child.getAttribute("id") || "",
      classList: Array.from(child.classList || []),
      principaisAtributos: collectPrimaryAttributes(child),
      textoResumido: truncate(getOwnAndDirectText(child), 160),
      selectorIndividual: buildCssSegment(child, analyzeId(child.getAttribute("id") || "")),
      elementKind: classifyElement(child)
    }));
  }

  function buildHtmlSummary(element) {
    const tagName = (element.tagName || "element").toLowerCase();
    const attributes = collectPrimaryAttributes(element);
    const attributeText = Object.entries(attributes)
      .slice(0, 12)
      .map(([name, value]) => `${name}="${truncate(value, 90)}"`)
      .join(" ");
    const openingTag = `<${tagName}${attributeText ? ` ${attributeText}` : ""}>`;
    const textPreview = truncate(getElementText(element, "innerText") || getElementText(element, "textContent"), 220);
    const summary = truncate(`${openingTag}${textPreview ? ` ${textPreview}` : ""}`, 500);

    return {
      openingTag,
      principaisAtributos: attributes,
      textPreview,
      summary,
      maxLength: 500,
      truncated: summary.length >= 500
    };
  }

  function buildPuppeteerSuggestions(element, recommendedSelectors, selectors, iframeInfo) {
    const best = recommendedSelectors.find((item) => item.type === "css" || item.type === "label" || item.type === "parentContext") ||
      recommendedSelectors[0] ||
      { selector: selectors.cssShort || selectors.cssFullPath || selectors.xpathFull, type: isXPath(selectors.xpathFull) ? "xpath" : "css" };
    const selector = best.selector || selectors.cssFullPath || "";
    const puppeteerSelector = best.type === "xpath" || isXPath(selector)
      ? toPuppeteerXPathSelector(selector)
      : selector;
    const selectorLiteral = JSON.stringify(puppeteerSelector);
    const elementKind = classifyElement(element);
    const click = [
      `await page.waitForSelector(${selectorLiteral});`,
      `await page.click(${selectorLiteral});`
    ].join("\n");
    const fill = buildFillSuggestion(elementKind, selectorLiteral);
    const readText = [
      `await page.waitForSelector(${selectorLiteral});`,
      `const texto = await page.$eval(${selectorLiteral}, el => el.innerText || el.textContent);`
    ].join("\n");
    const xpath = selectors.xpathFull
      ? [
          `const elemento = await page.waitForSelector(${JSON.stringify(toPuppeteerXPathSelector(selectors.xpathFull))});`,
          "await elemento.click();"
        ].join("\n")
      : "";
    const locator = `await page.locator(${selectorLiteral}).click();`;

    return {
      bestSelector: selector,
      puppeteerSelector,
      warning: best.warning || "",
      click,
      fill,
      readText,
      xpath,
      locator,
      iframe: buildIframeSuggestion(iframeInfo, puppeteerSelector, elementKind)
    };
  }

  function buildFillSuggestion(elementKind, selectorLiteral) {
    if (elementKind === "select") {
      return [
        `await page.waitForSelector(${selectorLiteral});`,
        `await page.select(${selectorLiteral}, "VALOR_AQUI");`
      ].join("\n");
    }

    if (elementKind === "input" || elementKind === "textarea") {
      return [
        `await page.waitForSelector(${selectorLiteral});`,
        `await page.click(${selectorLiteral}, { clickCount: 3 });`,
        `await page.type(${selectorLiteral}, "VALOR_AQUI");`
      ].join("\n");
    }

    return [
      "// O elemento capturado nao parece ser input, textarea ou select.",
      `await page.waitForSelector(${selectorLiteral});`
    ].join("\n");
  }

  function buildIframeSuggestion(iframeInfo, puppeteerSelector, elementKind) {
    if (!iframeInfo.isInsideIframe) {
      return "";
    }

    const lastFrame = iframeInfo.iframePath[iframeInfo.iframePath.length - 1];
    const selectorLiteral = JSON.stringify(puppeteerSelector);
    const action = elementKind === "input" || elementKind === "textarea"
      ? `await frame.type(${selectorLiteral}, "VALOR_AQUI");`
      : `await frame.click(${selectorLiteral});`;

    if (lastFrame?.frameName) {
      return [
        `const frame = page.frames().find(f => f.name() === ${JSON.stringify(lastFrame.frameName)});`,
        "if (!frame) throw new Error(\"Frame nao encontrado\");",
        `await frame.waitForSelector(${selectorLiteral});`,
        action
      ].join("\n");
    }

    if (lastFrame?.frameSrc) {
      const srcPart = truncate(lastFrame.frameSrc, 90);
      return [
        `const frame = page.frames().find(f => f.url().includes(${JSON.stringify(srcPart)}));`,
        "if (!frame) throw new Error(\"Frame nao encontrado\");",
        `await frame.waitForSelector(${selectorLiteral});`,
        action
      ].join("\n");
    }

    return [
      "// O elemento esta em iframe, mas o caminho exato nao ficou acessivel.",
      "// Localize o frame por name(), url() ou por uma cadeia de frameElement().",
      "const frame = page.frames().find(f => f.url().includes(\"PARTE_DA_URL_DO_FRAME\"));",
      "if (!frame) throw new Error(\"Frame nao encontrado\");",
      `await frame.waitForSelector(${selectorLiteral});`,
      action
    ].join("\n");
  }

  function buildStableAttributeSelectors(element) {
    const tag = (element.tagName || "").toLowerCase();
    const selectors = [];
    const priorityAttributes = [
      "name",
      "title",
      "aria-label",
      "aria-labelledby",
      "placeholder",
      "role",
      "type",
      "alt"
    ];

    priorityAttributes.forEach((name) => {
      const value = element.getAttribute(name);

      if (isStableAttributeValue(name, value)) {
        selectors.push(`${tag}[${cssEscape(name)}="${cssAttributeValue(value)}"]`);
      }
    });

    Array.from(element.attributes || []).forEach((attribute) => {
      if (attribute.name.startsWith("data-") && isStableAttributeValue(attribute.name, attribute.value)) {
        selectors.push(`${tag}[${cssEscape(attribute.name)}="${cssAttributeValue(attribute.value)}"]`);
      }
    });

    ["href", "src"].forEach((name) => {
      const rawValue = element.getAttribute(name);
      const value = stableUrlPart(rawValue);

      if (value) {
        selectors.push(`${tag}[${cssEscape(name)}*="${cssAttributeValue(value)}"]`);
      }
    });

    return unique(selectors);
  }

  function buildLabelSelectors(element, labelInfo) {
    if (!labelInfo.found) {
      return [];
    }

    const tag = (element.tagName || "*").toLowerCase();
    const selectors = [];
    const id = element.getAttribute("id");

    if (id && labelInfo.strategy === "label[for]") {
      selectors.push(`#${cssEscape(id)}`);
    }

    if (labelInfo.strategy === "aria-label") {
      selectors.push(`${tag}[aria-label="${cssAttributeValue(labelInfo.labelText)}"]`);
    }

    if (labelInfo.strategy === "title") {
      selectors.push(`${tag}[title="${cssAttributeValue(labelInfo.labelText)}"]`);
    }

    if (labelInfo.strategy === "placeholder") {
      selectors.push(`${tag}[placeholder="${cssAttributeValue(labelInfo.labelText)}"]`);
    }

    selectors.push(`//label[normalize-space(.)=${xpathLiteral(labelInfo.labelText)}]/following::${tag}[1]`);
    selectors.push(`//*[normalize-space(.)=${xpathLiteral(labelInfo.labelText)}]/following::${tag}[1]`);

    return unique(selectors);
  }

  function buildNearbyTextSelectors(element, labelInfo) {
    const tag = (element.tagName || "*").toLowerCase();
    const selectors = [];
    const texts = labelInfo.candidates
      .filter((candidate) => candidate.confidence !== "alta")
      .map((candidate) => candidate.labelText)
      .filter(Boolean)
      .slice(0, 3);

    texts.forEach((text) => {
      selectors.push(`//*[contains(normalize-space(.), ${xpathLiteral(text)})]/following::${tag}[1]`);
    });

    return unique(selectors);
  }

  function buildParentContextSelectors(element) {
    const parent = findStableAncestor(element);

    if (!parent) {
      return [];
    }

    const childSegment = buildCssSegment(element, analyzeId(element.getAttribute("id") || ""), {
      forceRelative: true
    });

    return unique([
      `${parent.selector} ${childSegment}`,
      `${parent.selector} > ${buildCssSegment(element, analyzeId(element.getAttribute("id") || ""), { forceNth: true })}`
    ]);
  }

  function buildCssShortSelector(element, idAnalysis, stableSelectors = []) {
    if (element.id && idAnalysis.status === "provavelmenteFixo") {
      return `#${cssEscape(element.id)}`;
    }

    if (stableSelectors.length > 0) {
      return stableSelectors[0];
    }

    const classSelector = buildClassSelector(element);

    if (classSelector) {
      return classSelector;
    }

    return buildCssFullPath(element);
  }

  function buildCssFullPath(element) {
    const parts = [];
    let current = element;
    let guard = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && guard < 80) {
      guard += 1;
      const idInfo = analyzeId(current.getAttribute("id") || "");

      if (current.id && idInfo.status === "provavelmenteFixo") {
        parts.unshift(`#${cssEscape(current.id)}`);
        break;
      }

      parts.unshift(buildCssSegment(current, idInfo, { forceNth: true }));

      if ((current.tagName || "").toLowerCase() === "html") {
        break;
      }

      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function buildCssSegment(element, idAnalysis = analyzeId(element.getAttribute("id") || ""), options = {}) {
    const tag = (element.tagName || "element").toLowerCase();

    if (!options.forceRelative && element.id && idAnalysis.status === "provavelmenteFixo") {
      return `${tag}#${cssEscape(element.id)}`;
    }

    const stableAttributes = buildStableAttributeSelectors(element);

    if (!options.forceNth && stableAttributes.length > 0) {
      return stableAttributes[0];
    }

    const classSelector = buildClassSelector(element);

    if (!options.forceNth && classSelector) {
      return classSelector;
    }

    const nth = getNthOfType(element);
    return `${tag}:nth-of-type(${nth})`;
  }

  function buildClassSelector(element) {
    const tag = (element.tagName || "").toLowerCase();
    const stableClasses = Array.from(element.classList || [])
      .filter((className) => className.length <= 36 && !looksDynamicValue(className))
      .slice(0, 3);

    if (stableClasses.length === 0) {
      return "";
    }

    return `${tag}.${stableClasses.map(cssEscape).join(".")}`;
  }

  function buildXPathFull(element) {
    const parts = [];
    let current = element;
    let guard = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && guard < 80) {
      guard += 1;
      const tag = (current.tagName || "").toLowerCase();
      const index = getNthOfType(current);
      parts.unshift(`${tag}[${index}]`);

      if (tag === "html") {
        break;
      }

      current = current.parentElement;
    }

    return `/${parts.join("/")}`;
  }

  function buildXPathByText(element) {
    const text = normalizeText(getElementText(element, "innerText") || getElementText(element, "textContent"), 90);

    if (!text) {
      return "";
    }

    const tag = (element.tagName || "*").toLowerCase();

    if (text.length <= 55) {
      return `//${tag}[normalize-space(.)=${xpathLiteral(text)}]`;
    }

    return `//${tag}[contains(normalize-space(.), ${xpathLiteral(text.slice(0, 55))})]`;
  }

  function findStableAncestor(element) {
    let current = element.parentElement;
    let depth = 0;

    while (current && depth < 6) {
      const idInfo = analyzeId(current.getAttribute("id") || "");
      const stableAttributes = buildStableAttributeSelectors(current);

      if (current.id && idInfo.status === "provavelmenteFixo") {
        return {
          element: current,
          selector: `#${cssEscape(current.id)}`
        };
      }

      if (stableAttributes.length > 0) {
        return {
          element: current,
          selector: stableAttributes[0]
        };
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function classifyElement(element) {
    const tag = (element.tagName || "").toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    const type = (element.getAttribute("type") || "").toLowerCase();

    if (tag === "textarea") {
      return "textarea";
    }

    if (tag === "select") {
      return "select";
    }

    if (tag === "input") {
      return ["button", "submit", "reset", "image"].includes(type) ? "button" : "input";
    }

    if (tag === "button" || role === "button") {
      return "button";
    }

    if (tag === "a" || role === "link") {
      return "link";
    }

    if (tag === "img" || tag === "picture" || tag === "svg") {
      return "image";
    }

    if (tag === "table" || role === "table" || role === "grid") {
      return "table";
    }

    if (tag === "tr" || role === "row") {
      return "tableRow";
    }

    if (["td", "th"].includes(tag) || ["cell", "gridcell", "columnheader", "rowheader"].includes(role)) {
      return "tableCell";
    }

    if (tag === "form") {
      return "form";
    }

    if (tag === "label") {
      return "label";
    }

    if (["div", "section", "article", "main", "aside", "header", "footer", "nav", "span"].includes(tag)) {
      return "container";
    }

    return "unknown";
  }

  function collectAttributes(element) {
    const attributes = {};

    Array.from(element.attributes || []).forEach((attribute) => {
      attributes[attribute.name] = truncate(attribute.value, 300);
    });

    return attributes;
  }

  function collectPrimaryAttributes(element) {
    const attributes = {};
    const preferred = [
      "id",
      "name",
      "type",
      "role",
      "title",
      "aria-label",
      "aria-labelledby",
      "placeholder",
      "for",
      "href",
      "src",
      "alt",
      "class"
    ];

    preferred.forEach((name) => {
      const value = element.getAttribute(name);

      if (value) {
        attributes[name] = truncate(value, 160);
      }
    });

    Array.from(element.attributes || []).forEach((attribute) => {
      if (attribute.name.startsWith("data-")) {
        attributes[attribute.name] = truncate(attribute.value, 160);
      }
    });

    return attributes;
  }

  function collectStableAttributeNames(element) {
    return Array.from(element.attributes || [])
      .filter((attribute) => isStableAttributeValue(attribute.name, attribute.value))
      .map((attribute) => attribute.name)
      .slice(0, 8);
  }

  function isStableAttributeValue(name, value) {
    if (!value || value.length > 140) {
      return false;
    }

    if (["style", "class", "onclick", "onchange"].includes(name)) {
      return false;
    }

    if (name === "type" && ["hidden", "password"].includes(value.toLowerCase())) {
      return false;
    }

    if (name.startsWith("data-")) {
      return !looksDynamicValue(value);
    }

    return !looksDynamicValue(value) || ["title", "aria-label", "placeholder", "role", "name", "alt"].includes(name);
  }

  function looksDynamicValue(value) {
    if (!value) {
      return false;
    }

    const text = String(value);
    const digitCount = (text.match(/\d/g) || []).length;

    return digitCount >= 5 ||
      digitCount / Math.max(text.length, 1) > 0.35 ||
      /(?:ember|react-select|generated|auto|uuid|random|guid|isc_|sap-ui|__|^m\d+:)/i.test(text) ||
      /[a-f0-9]{8,}-[a-f0-9-]{8,}/i.test(text) ||
      text.length > 80;
  }

  function findPreviousDomText(element) {
    let current = element;
    let steps = 0;

    while (current && steps < 20) {
      steps += 1;

      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.TEXT_NODE) {
          const text = normalizeText(sibling.textContent, 140);

          if (text) {
            return { text, element: current.previousElementSibling };
          }
        }

        if (sibling.nodeType === Node.ELEMENT_NODE) {
          const text = normalizeText(sibling.innerText || sibling.textContent, 140);

          if (text) {
            return { text, element: sibling };
          }
        }

        sibling = sibling.previousSibling;
      }

      current = current.parentElement;
    }

    return { text: "", element: null };
  }

  function findPreviousTableText(element) {
    const cell = element.closest?.("td, th");
    const previousCell = cell?.previousElementSibling;
    const text = normalizeText(previousCell?.innerText || previousCell?.textContent, 160);

    return {
      text,
      element: previousCell || null
    };
  }

  function findPreviousSiblingText(element) {
    let sibling = element.previousElementSibling;

    while (sibling) {
      const text = normalizeText(sibling.innerText || sibling.textContent, 160);

      if (text) {
        return { text, element: sibling };
      }

      sibling = sibling.previousElementSibling;
    }

    return { text: "", element: null };
  }

  function findParentContextText(element) {
    const parent = element.parentElement;

    if (!parent) {
      return { text: "", element: null };
    }

    const cloneText = Array.from(parent.childNodes || [])
      .filter((node) => node !== element)
      .map((node) => node.textContent || "")
      .join(" ");

    return {
      text: normalizeText(cloneText, 160),
      element: parent
    };
  }

  function findVisualLabelCandidates(element) {
    const rect = element.getBoundingClientRect();
    const candidates = [];
    const possibleLabels = Array.from(document.querySelectorAll("label, span, div, p, td, th, strong, b"))
      .slice(0, 1200);

    possibleLabels.forEach((candidate) => {
      if (candidate === element || candidate.contains(element) || element.contains(candidate)) {
        return;
      }

      const text = normalizeText(candidate.innerText || candidate.textContent, 140);

      if (!text) {
        return;
      }

      const candidateRect = candidate.getBoundingClientRect();

      if (candidateRect.width === 0 || candidateRect.height === 0) {
        return;
      }

      const horizontalDistance = Math.max(0, rect.left - candidateRect.right, candidateRect.left - rect.right);
      const verticalDistance = Math.max(0, rect.top - candidateRect.bottom, candidateRect.top - rect.bottom);
      const distance = Math.round(Math.sqrt(horizontalDistance ** 2 + verticalDistance ** 2));

      if (distance <= 140) {
        candidates.push({
          text,
          element: candidate,
          distance,
          confidence: distance <= 50 ? "média" : "baixa"
        });
      }
    });

    return candidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
  }

  function readElementValue(element) {
    const tag = (element.tagName || "").toLowerCase();
    const type = (element.getAttribute("type") || "").toLowerCase();

    if (type === "password") {
      return "[valor oculto: input password]";
    }

    if (["input", "textarea", "select", "option"].includes(tag) && "value" in element) {
      return truncate(element.value, 250);
    }

    return "";
  }

  function getBooleanProperty(element, property) {
    return property in element ? Boolean(element[property]) : false;
  }

  function readUrlAttribute(element, name) {
    if (name in element && typeof element[name] === "string") {
      return truncate(element[name], 300);
    }

    return truncate(element.getAttribute(name) || "", 300);
  }

  function getElementText(element, property) {
    try {
      return property in element ? element[property] || "" : "";
    } catch (error) {
      return "";
    }
  }

  function getOwnAndDirectText(element) {
    return Array.from(element.childNodes || [])
      .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE)
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || "";
        }

        return Array.from(node.childNodes || [])
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent || "")
          .join(" ");
      })
      .join(" ");
  }

  function isFocusable(element) {
    if (element.tabIndex >= 0) {
      return true;
    }

    const tag = (element.tagName || "").toLowerCase();

    if (["input", "select", "textarea", "button"].includes(tag)) {
      return !getBooleanProperty(element, "disabled");
    }

    if (tag === "a") {
      return Boolean(element.getAttribute("href"));
    }

    return Boolean(element.getAttribute("contenteditable"));
  }

  function stableUrlPart(value) {
    if (!value || value.length < 4) {
      return "";
    }

    try {
      const url = new URL(value, location.href);
      const path = `${url.pathname}${url.search ? url.search.slice(0, 80) : ""}`;
      const parts = path.split("/").filter(Boolean);
      return truncate(parts.slice(-2).join("/"), 120);
    } catch (error) {
      return truncate(value, 80);
    }
  }

  function toPuppeteerXPathSelector(xpath) {
    if (!xpath) {
      return "";
    }

    if (xpath.startsWith("::-p-xpath(")) {
      return xpath;
    }

    return `::-p-xpath(${xpath})`;
  }

  function isXPath(selector) {
    return typeof selector === "string" && (
      selector.startsWith("/") ||
      selector.startsWith("(") ||
      selector.startsWith("::-p-xpath(")
    );
  }

  function safeQuerySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch (error) {
      return null;
    }
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function cssAttributeValue(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"")
      .replace(/\n/g, "\\A ");
  }

  function xpathLiteral(value) {
    const text = String(value);

    if (!text.includes("'")) {
      return `'${text}'`;
    }

    if (!text.includes("\"")) {
      return `"${text}"`;
    }

    const singleQuoteLiteral = "\"'\"";
    const parts = text.split("'").map((part) => `'${part}'`);
    return `concat(${parts.join(`, ${singleQuoteLiteral}, `)})`;
  }

  function getNthOfType(element) {
    let index = 1;
    let sibling = element.previousElementSibling;
    const tag = element.tagName;

    while (sibling) {
      if (sibling.tagName === tag) {
        index += 1;
      }

      sibling = sibling.previousElementSibling;
    }

    return index;
  }

  function toPlainRect(rect) {
    return {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      top: round(rect.top),
      left: round(rect.left),
      right: round(rect.right),
      bottom: round(rect.bottom)
    };
  }

  function isPointInViewport(x, y) {
    return x >= 0 &&
      y >= 0 &&
      x <= (window.innerWidth || document.documentElement.clientWidth) &&
      y <= (window.innerHeight || document.documentElement.clientHeight);
  }

  function normalizeText(value, maxLength = MAX_TEXT) {
    return truncate(String(value || "").replace(/\s+/g, " ").trim(), maxLength);
  }

  function truncate(value, maxLength = MAX_TEXT) {
    const text = String(value || "");

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  function round(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function uniqueObjects(values, keyFactory) {
    const seen = new Set();
    const output = [];

    values.forEach((value) => {
      const key = keyFactory(value);

      if (!seen.has(key)) {
        seen.add(key);
        output.push(value);
      }
    });

    return output;
  }

  function confidenceScore(confidence) {
    return {
      alta: 3,
      "média": 2,
      baixa: 1
    }[confidence] || 0;
  }

  function createCaptureId() {
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }

    return `capture-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
})();
