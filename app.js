(function () {
  "use strict";

  const core = window.GcodeCore;
  const storageKey = "manual-filament-shift-preferences-v1";
  const state = {
    file: null,
    analysis: null,
    lastDownload: null,
    preferences: loadPreferences(),
  };

  const elements = {
    fileInput: document.querySelector("#file-input"),
    dropZone: document.querySelector("#drop-zone"),
    fileError: document.querySelector("#file-error"),
    workspace: document.querySelector("#workspace"),
    summaryFile: document.querySelector("#summary-file"),
    summarySize: document.querySelector("#summary-size"),
    summaryLayers: document.querySelector("#summary-layers"),
    summaryHeight: document.querySelector("#summary-height"),
    summaryEvents: document.querySelector("#summary-events"),
    summaryCleanup: document.querySelector("#summary-cleanup"),
    summaryTime: document.querySelector("#summary-time"),
    summarySlicer: document.querySelector("#summary-slicer"),
    filamentList: document.querySelector("#filament-list"),
    eventList: document.querySelector("#event-list"),
    selectedCount: document.querySelector("#selected-count"),
    eventWarning: document.querySelector("#event-warning"),
    waitTemperature: document.querySelector("#wait-temperature"),
    removeCleanup: document.querySelector("#remove-cleanup"),
    setFilamentType: document.querySelector("#set-filament-type"),
    pauseCommand: document.querySelector("#pause-command"),
    convertButton: document.querySelector("#convert-button"),
    resetButton: document.querySelector("#reset-button"),
    result: document.querySelector("#result"),
    resultTitle: document.querySelector("#result-title"),
    resultCopy: document.querySelector("#result-copy"),
    downloadAgain: document.querySelector("#download-again"),
  };

  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", () => {
    if (elements.fileInput.files[0]) {
      openFile(elements.fileInput.files[0]);
    }
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  }

  elements.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) {
      openFile(file);
    }
  });

  elements.eventList.addEventListener("change", updateSelectedCount);
  elements.convertButton.addEventListener("click", convertAndDownload);
  elements.resetButton.addEventListener("click", resetApp);
  elements.downloadAgain.addEventListener("click", () => {
    if (state.lastDownload) {
      downloadText(state.lastDownload.text, state.lastDownload.filename);
    }
  });

  openFileFromQuery();

  async function openFileFromQuery() {
    const requestedFile = new URLSearchParams(window.location.search).get("file");
    if (!requestedFile || window.location.protocol === "file:") {
      return;
    }

    try {
      const url = new URL(requestedFile, window.location.href);
      if (url.origin !== window.location.origin) {
        throw new Error("Only same-origin files can be loaded.");
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("File request failed with status " + response.status);
      }

      const blob = await response.blob();
      const filename =
        decodeURIComponent(url.pathname.split("/").pop()) || "print.gcode";
      await openFile(
        new File([blob], filename, {
          type: blob.type || "text/plain",
        })
      );
    } catch (error) {
      console.error(error);
      showError("The G-code file in the URL could not be loaded.");
    }
  }

  async function openFile(file) {
    hideError();
    elements.result.hidden = true;

    if (!/\.(gcode|gco|gc)$/i.test(file.name)) {
      showError("Choose a .gcode, .gco, or .gc file.");
      return;
    }

    if (file.size > 250 * 1024 * 1024) {
      showError("This file is larger than 250 MB and may overwhelm the browser.");
      return;
    }

    elements.dropZone.querySelector("strong").textContent = "Reading file...";

    try {
      const text = await file.text();
      const analysis = core.analyzeGcode(text);

      state.file = file;
      state.analysis = analysis;
      state.lastDownload = null;
      renderWorkspace();
      elements.workspace.hidden = false;
      elements.workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      showError("The file could not be analyzed. Confirm that it is plain-text G-code.");
    } finally {
      elements.dropZone.querySelector("strong").textContent = "Drop G-code here";
    }
  }

  function renderWorkspace() {
    const { analysis, file } = state;
    const totalSeconds =
      analysis.metadata.totalTimeSeconds || analysis.metadata.modelTimeSeconds;

    elements.summaryFile.textContent = file.name;
    elements.summarySize.textContent =
      formatBytes(file.size) + " / " + analysis.lineCount.toLocaleString() + " lines";
    elements.summaryLayers.textContent =
      analysis.metadata.totalLayers?.toLocaleString() || "Unknown";
    elements.summaryHeight.textContent = analysis.metadata.maxZ
      ? analysis.metadata.maxZ + " mm tall"
      : "Height not found";
    elements.summaryEvents.textContent = analysis.events.length.toLocaleString();
    elements.summaryCleanup.textContent = analysis.cleanupBlocks.length
      ? analysis.cleanupBlocks.length + " final AMS unload block found"
      : "No final AMS unload block";
    elements.summaryTime.textContent = totalSeconds
      ? formatLongDuration(totalSeconds)
      : "Unknown";
    elements.summarySlicer.textContent =
      analysis.metadata.slicer || analysis.metadata.printer;

    renderFilaments();
    renderEvents();
    renderWarnings();
    updateSelectedCount();
  }

  function renderFilaments() {
    elements.filamentList.replaceChildren();

    for (const filament of state.analysis.filaments) {
      const saved = state.preferences.filaments[filament.tool] || {};
      const card = document.createElement("article");
      card.className = "filament-card";
      card.innerHTML = `
        <label class="color-control" title="Choose display color">
          <input
            type="color"
            value="${escapeAttribute(saved.color || filament.color)}"
            data-color-tool="${filament.tool}"
            aria-label="Color for filament ${filament.slot}"
          />
        </label>
        <label>
          Slot ${filament.slot} / T${filament.tool}
          <input
            type="text"
            value="${escapeAttribute(saved.name || filament.defaultName)}"
            data-name-tool="${filament.tool}"
            maxlength="80"
          />
        </label>
        <p class="filament-meta">${escapeHtml(
          [filament.profile || filament.type, filament.vendor]
            .filter(Boolean)
            .join(" / ")
        )}</p>
      `;
      elements.filamentList.append(card);
    }

    elements.filamentList.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", saveFilamentPreferences);
    });
  }

  function renderEvents() {
    elements.eventList.replaceChildren();
    let changeNumber = 0;

    for (const event of state.analysis.events) {
      const target = getFilament(event.targetTool);
      const source = getFilament(event.fromTool);
      const eventLabel =
        event.kind === "initial"
          ? "Initial load"
          : "Change " + String(++changeNumber);
      const row = document.createElement("tr");
      const sourceMarkup = source
        ? filamentLabel(source)
        : event.kind === "initial"
          ? '<span class="route-arrow">Printer start</span>'
          : '<span class="route-arrow">Current filament</span>';
      const routeMarkup =
        event.kind === "initial"
          ? filamentLabel(target)
          : sourceMarkup +
            '<span class="route-arrow">to</span>' +
            filamentLabel(target);

      row.innerHTML = `
        <td>
          <input
            class="event-toggle"
            type="checkbox"
            data-event-id="${event.id}"
            aria-label="Convert pause ${event.number}"
            checked
          />
        </td>
        <td>
          <strong>${eventLabel}</strong>
          <small>G-code line ${event.line.toLocaleString()}</small>
        </td>
        <td>
          <strong>${event.layer}/${event.totalLayers || "?"}</strong>
          <small>${event.z !== null ? "Z " + event.z + " mm" : "Height unknown"}</small>
        </td>
        <td>
          <strong>${core.formatElapsed(event.elapsedSeconds)}</strong>
          <small>${event.progress !== null ? event.progress + "% progress" : "Start of print"}</small>
        </td>
        <td><div class="filament-route">${routeMarkup}</div></td>
      `;
      elements.eventList.append(row);
    }

    if (!state.analysis.events.length) {
      const row = document.createElement("tr");
      row.innerHTML =
        '<td colspan="5"><strong>No AMS tool changes were found.</strong><small>This file may already be configured for a single manual filament.</small></td>';
      elements.eventList.append(row);
    }
  }

  function renderWarnings() {
    const rawEvents = state.analysis.events.filter((event) => event.kind === "raw");
    const messages = [];

    if (rawEvents.length) {
      messages.push(
        rawEvents.length +
          " standalone T command" +
          (rawEvents.length === 1 ? " was" : "s were") +
          " found without a complete M620/M621 block. Review those pauses carefully."
      );
    }

    if (!/Bambu|OrcaSlicer/i.test(state.analysis.metadata.slicer)) {
      messages.push(
        "The slicer signature was not recognized as Bambu Studio or OrcaSlicer."
      );
    }

    elements.eventWarning.hidden = messages.length === 0;
    elements.eventWarning.textContent = messages.join(" ");
  }

  function updateSelectedCount() {
    const checkboxes = [
      ...elements.eventList.querySelectorAll(".event-toggle"),
    ];
    const selected = checkboxes.filter((checkbox) => checkbox.checked).length;
    elements.selectedCount.textContent =
      selected +
      " of " +
      checkboxes.length +
      " pause" +
      (checkboxes.length === 1 ? "" : "s") +
      " selected";
    elements.convertButton.disabled = !selected;
  }

  function convertAndDownload() {
    const selectedEventIds = [
      ...elements.eventList.querySelectorAll(".event-toggle:checked"),
    ].map((checkbox) => checkbox.dataset.eventId);
    const names = {};

    elements.filamentList.querySelectorAll("[data-name-tool]").forEach((input) => {
      names[Number(input.dataset.nameTool)] = input.value.trim();
    });

    const result = core.transformGcode(state.analysis, {
      selectedEventIds,
      names,
      pauseCommand: elements.pauseCommand.value,
      waitForTemperature: elements.waitTemperature.checked,
      removeAmsCleanup: elements.removeCleanup.checked,
      setFilamentType: elements.setFilamentType.checked,
    });
    const filename = createOutputName(state.file.name, result.convertedCount);

    state.lastDownload = { text: result.text, filename };
    downloadText(result.text, filename);

    elements.result.hidden = false;
    elements.resultTitle.textContent =
      result.convertedCount +
      " manual pause" +
      (result.convertedCount === 1 ? "" : "s") +
      " created";
    elements.resultCopy.textContent = result.remainingAmsCommands.length
      ? filename +
        " was downloaded. " +
        result.remainingAmsCommands.length +
        " AMS-related command(s) remain because some events were not selected."
      : filename +
        " was downloaded with the selected AMS changes removed" +
        (result.cleanupRemoved ? " and the final AMS unload disabled." : ".");
  }

  function saveFilamentPreferences() {
    const filaments = {};
    for (const filament of state.analysis.filaments) {
      filaments[filament.tool] = {
        name:
          elements.filamentList.querySelector(
            `[data-name-tool="${filament.tool}"]`
          )?.value || filament.defaultName,
        color:
          elements.filamentList.querySelector(
            `[data-color-tool="${filament.tool}"]`
          )?.value || filament.color,
      };
    }

    state.preferences.filaments = {
      ...state.preferences.filaments,
      ...filaments,
    };
    localStorage.setItem(storageKey, JSON.stringify(state.preferences));
    renderEvents();
    updateSelectedCount();
  }

  function getFilament(tool) {
    if (tool === null || tool === undefined) {
      return null;
    }

    const filament = state.analysis.filaments.find((item) => item.tool === tool);
    if (!filament) {
      return {
        tool,
        slot: tool + 1,
        defaultName: "Filament " + (tool + 1),
        color: "#64748b",
      };
    }

    const saved = state.preferences.filaments[tool] || {};
    return {
      ...filament,
      defaultName: saved.name || filament.defaultName,
      color: saved.color || filament.color,
    };
  }

  function filamentLabel(filament) {
    return `
      <span class="swatch" style="background:${escapeAttribute(filament.color)}"></span>
      <strong>${escapeHtml(filament.defaultName)}</strong>
    `;
  }

  function resetApp() {
    state.file = null;
    state.analysis = null;
    state.lastDownload = null;
    elements.fileInput.value = "";
    elements.workspace.hidden = true;
    elements.result.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createOutputName(filename, count) {
    const base = filename.replace(/\.(gcode|gco|gc)$/i, "");
    return base + "-manual-" + count + "-changes.gcode";
  }

  function loadPreferences() {
    try {
      return {
        filaments: {},
        ...JSON.parse(localStorage.getItem(storageKey) || "{}"),
      };
    } catch {
      return { filaments: {} };
    }
  }

  function showError(message) {
    elements.fileError.textContent = message;
    elements.fileError.hidden = false;
  }

  function hideError() {
    elements.fileError.hidden = true;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) {
      return bytes + " B";
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + " KB";
    }
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatLongDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours ? hours + "h " + minutes + "m" : minutes + "m";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
