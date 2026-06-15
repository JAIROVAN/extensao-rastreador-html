const trackButton = document.getElementById("trackButton");

trackButton.addEventListener("click", async () => {
  trackButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "rastreador:startTracking"
    });

    if (!response || !response.ok) {
      const message = response?.error || "Nao foi possivel ativar o modo rastrear nesta pagina.";
      alert(message);
    } else {
      if (response.warning) {
        alert(response.warning);
      }

      window.close();
    }
  } catch (error) {
    alert(error?.message || "Falha ao iniciar o Rastreador HTML.");
  } finally {
    trackButton.disabled = false;
  }
});
