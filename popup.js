const trackButton = document.getElementById("trackButton");
const stopButton = document.getElementById("stopButton");

let isBusy = false;
let isTracking = false;
let statusTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  refreshTrackingStatus();
  statusTimer = window.setInterval(refreshTrackingStatus, 800);
});

window.addEventListener("focus", refreshTrackingStatus);
window.addEventListener("pagehide", () => {
  if (statusTimer) {
    window.clearInterval(statusTimer);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "rastreador:trackingStarted") {
    isTracking = true;
    updateButtons();
  }

  if (message?.type === "rastreador:trackingStopped") {
    isTracking = false;
    updateButtons();
  }
});

refreshTrackingStatus();

trackButton.addEventListener("click", async () => {
  isBusy = true;
  updateButtons();

  try {
    const startPromise = chrome.runtime.sendMessage({
      type: "rastreador:startTracking",
      skipPanelOpen: true
    });
    const panelResult = await openSidePanelFromPopup();
    const response = await startPromise;

    if (!response || !response.ok) {
      const message = response?.error || "Nao foi possivel ativar o modo rastrear nesta pagina.";
      alert(message);
      isTracking = false;
    } else {
      isTracking = true;

      if (!panelResult.ok) {
        alert(panelResult.warning || "Nao foi possivel abrir a barra lateral automaticamente.");
      }
    }

    await refreshTrackingStatus();
  } catch (error) {
    alert(error?.message || "Falha ao iniciar o Rastreador HTML.");
  } finally {
    isBusy = false;
    updateButtons();
  }
});

stopButton.addEventListener("click", async () => {
  isBusy = true;
  updateButtons();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "rastreador:stopTracking"
    });

    if (!response || !response.ok) {
      const message = response?.error || "Nao foi possivel interromper o rastreamento.";
      alert(message);
    } else {
      isTracking = false;
    }

    await refreshTrackingStatus();
  } catch (error) {
    alert(error?.message || "Falha ao interromper o rastreamento.");
  } finally {
    isBusy = false;
    updateButtons();
  }
});

async function refreshTrackingStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "rastreador:getTrackingStatus"
    });

    isTracking = Boolean(response?.ok && response.isTracking);
  } catch (error) {
    isTracking = false;
  }

  updateButtons();
}

function updateButtons() {
  trackButton.disabled = isBusy || isTracking;
  stopButton.disabled = isBusy || !isTracking;
}

async function openSidePanelFromPopup() {
  if (!chrome.sidePanel || typeof chrome.sidePanel.open !== "function") {
    return {
      ok: false,
      warning: "Este Chrome nao disponibilizou a API de barra lateral."
    };
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab || typeof tab.id !== "number") {
      return {
        ok: false,
        warning: "Nenhuma aba ativa encontrada para abrir a barra lateral."
      };
    }

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
      warning: error?.message || "Nao foi possivel abrir a barra lateral."
    };
  }
}
