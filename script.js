// --- CONFIGURATION ---
const COOLDOWN_SECONDS = 1;
const STORAGE_KEY = "mantharaCounterState.v4";
const HISTORY_KEY = "mantharaCounterHistory.v4";
const DAY_MS = 24 * 60 * 60 * 1000;

const defaultState = {
  targetType: "count", // 'count' or 'time'
  target: 108,
  done: 0,
  lastTapAt: 0,
  setStartedAt: 0,
  setFinishedAt: 0,
  historyRecorded: false,
};

const elements = {
  doneCount: document.getElementById("doneCount"),
  targetText: document.getElementById("targetText"),
  leftCount: document.getElementById("leftCount"),
  cooldownText: document.getElementById("cooldownText"),
  progressCircle: document.getElementById("progressCircle"),
  tapBtn: document.getElementById("tapBtn"),
  autoPlayBtn: document.getElementById("autoPlayBtn"),
  message: document.getElementById("message"),
  targetForm: document.getElementById("targetForm"),
  targetTypeSelect: document.getElementById("targetTypeSelect"),
  targetInput: document.getElementById("targetInput"),
  presetRowCount: document.getElementById("presetRowCount"),
  presetRowTime: document.getElementById("presetRowTime"),
  resetBtn: document.getElementById("resetBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  historyList: document.getElementById("historyList"),
  historyTotal: document.getElementById("historyTotal"),
  installBanner: document.getElementById("installBanner"),
  installBtn: document.getElementById("installBtn"),
  seeTimeBtn: document.getElementById("seeTimeBtn"),
  timeDialog: document.getElementById("timeDialog"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  diagCount: document.getElementById("diagCount"),
  diagElapsed: document.getElementById("diagElapsed"),
  diagAvg: document.getElementById("diagAvg"),
  audioUpload: document.getElementById("audioUpload"),
  audioLibraryList: document.getElementById("audioLibraryList"),
  speedSelect: document.getElementById("speedSelect"),
};

let state = loadState();
let deferredInstallPrompt = null;
let cooldownTimer = null;
let dialogTimer = null;

// --- AUDIO SYSTEM ---
let audioDB = null;
let currentAudioId = null;
let currentAudioBlobUrl = null;
let isAutoPlaying = false;
const audioPlayer = new Audio();

// IDB Initialization
function initAudioDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("MantharaLibrary", 1);
    req.onupgradeneeded = (e) => {
      audioDB = e.target.result;
      if (!audioDB.objectStoreNames.contains("audios")) {
        audioDB.createObjectStore("audios", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = (e) => {
      audioDB = e.target.result;
      resolve(audioDB);
    };
    req.onerror = (e) => reject(e);
  });
}

// Load and render library
async function loadLibrary() {
  if (!audioDB) await initAudioDB();
  const tx = audioDB.transaction("audios", "readonly");
  const store = tx.objectStore("audios");
  const req = store.getAll();

  req.onsuccess = () => {
    const files = req.result;
    if (files.length === 0) {
      elements.audioLibraryList.innerHTML =
        '<p class="history-empty">No audio added yet. Upload an MP3 or MP4 to start.</p>';
      return;
    }

    elements.audioLibraryList.innerHTML = files
      .map(
        (file) => `
      <div class="audio-item ${currentAudioId === file.id ? "active" : ""}" data-id="${file.id}">
        <span class="audio-item-name">${file.name}</span>
        <button class="delete-audio-btn" data-id="${file.id}">×</button>
      </div>
    `,
      )
      .join("");

    // Attach selection events
    document.querySelectorAll(".audio-item").forEach((item) => {
      item.addEventListener("click", function (e) {
        if (e.target.classList.contains("delete-audio-btn")) return;
        const id = Number(this.dataset.id);
        selectAudio(id);
      });
    });

    // Attach delete events
    document.querySelectorAll(".delete-audio-btn").forEach((btn) => {
      btn.addEventListener("click", async function () {
        const id = Number(this.dataset.id);
        await deleteAudio(id);
      });
    });
  };
}

async function saveAudioFile(file) {
  if (!audioDB) await initAudioDB();
  const tx = audioDB.transaction("audios", "readwrite");
  tx.objectStore("audios").add({ name: file.name, blob: file });
  tx.oncomplete = () => loadLibrary();
}

async function deleteAudio(id) {
  if (!audioDB) await initAudioDB();
  const tx = audioDB.transaction("audios", "readwrite");
  tx.objectStore("audios").delete(id);
  tx.oncomplete = () => {
    if (currentAudioId === id) {
      currentAudioId = null;
      if (currentAudioBlobUrl) URL.revokeObjectURL(currentAudioBlobUrl);
      currentAudioBlobUrl = null;
      stopAutoPlay();
    }
    loadLibrary();
  };
}

async function selectAudio(id) {
  if (!audioDB) await initAudioDB();
  const tx = audioDB.transaction("audios", "readonly");
  const req = tx.objectStore("audios").get(id);

  req.onsuccess = () => {
    if (req.result) {
      if (currentAudioBlobUrl) URL.revokeObjectURL(currentAudioBlobUrl);
      currentAudioId = id;
      currentAudioBlobUrl = URL.createObjectURL(req.result.blob);
      audioPlayer.src = currentAudioBlobUrl;
      audioPlayer.playbackRate = parseFloat(elements.speedSelect.value);
      elements.autoPlayBtn.disabled = false;
      loadLibrary(); // Re-render to highlight active
    }
  };
}

elements.audioUpload.addEventListener("change", (e) => {
  const files = e.target.files;
  for (let file of files) {
    // Check for both Audio files and MP4/Video formats which contain audio
    if (
      file.type.startsWith("audio/") ||
      file.type.startsWith("video/") ||
      file.name.endsWith(".m4a")
    ) {
      saveAudioFile(file);
    }
  }
  e.target.value = ""; // Reset
});

elements.speedSelect.addEventListener("change", (e) => {
  audioPlayer.playbackRate = parseFloat(e.target.value);
});

// Auto Play Logic
function toggleAutoPlay() {
  if (state.targetType === "count" && state.done >= state.target) return;
  if (state.targetType === "time" && state.historyRecorded) return;

  if (isAutoPlaying) {
    stopAutoPlay();
  } else {
    isAutoPlaying = true;
    elements.autoPlayBtn.textContent = "⏸ Pause Auto-Play";
    elements.autoPlayBtn.classList.replace("secondary-btn", "primary-btn");
    elements.tapBtn.disabled = true; // Disable manual tap during auto
    playNextAudioLoop();
  }
}

function stopAutoPlay() {
  isAutoPlaying = false;
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  elements.autoPlayBtn.textContent = "▶ Start Auto-Play";
  elements.autoPlayBtn.classList.replace("primary-btn", "secondary-btn");

  const isDone =
    state.targetType === "count"
      ? state.done >= state.target
      : state.historyRecorded;
  elements.autoPlayBtn.disabled = !currentAudioId || isDone;
  render();
}

function playNextAudioLoop() {
  if (!isAutoPlaying) {
    stopAutoPlay();
    return;
  }
  if (state.targetType === "count" && state.done >= state.target) {
    stopAutoPlay();
    return;
  }

  audioPlayer.play().catch((e) => {
    console.error("Auto-play blocked:", e);
    stopAutoPlay();
    elements.message.textContent =
      "Auto-play was blocked by browser. Interact with the page first.";
  });
}

audioPlayer.addEventListener("ended", () => {
  if (!isAutoPlaying) return;

  // Register the count!
  processTap(true);

  let shouldStop = false;

  // If goal is Count
  if (state.targetType === "count" && state.done >= state.target) {
    shouldStop = true;
  }
  // If goal is Time limit
  else if (state.targetType === "time" && state.setStartedAt) {
    const elapsed = Date.now() - state.setStartedAt;
    if (elapsed >= state.target * 60 * 1000) {
      shouldStop = true;
    }
  }

  if (shouldStop) {
    if (!state.historyRecorded) {
      addHistorySet({ status: "Completed", finishedAt: Date.now() });
      playCompletionSound();
    }
    stopAutoPlay();
    render();
  } else {
    // 0.5 SECOND GAP REQUIRED BEFORE NEXT LOOP
    setTimeout(() => {
      if (isAutoPlaying) playNextAudioLoop();
    }, 500);
  }
});

elements.autoPlayBtn.addEventListener("click", toggleAutoPlay);

// --- CORE LOGIC ---
function playCompletionSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 2);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 2);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

function loadState() {
  try {
    return {
      ...defaultState,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY)),
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function cleanHistory() {
  const cutoff = Date.now() - DAY_MS;
  const cleaned = loadHistory().filter((item) => item.finishedAt >= cutoff);
  saveHistory(cleaned);
  return cleaned;
}

function addHistorySet({ status = "Completed", finishedAt = Date.now() } = {}) {
  if (state.done <= 0) return;
  const history = cleanHistory();
  const startedAt = state.setStartedAt || finishedAt;

  const targetLabel =
    state.targetType === "time" ? `${state.target}m` : state.target;

  history.unshift({
    id: `${startedAt}-${finishedAt}-${Math.random().toString(16).slice(2)}`,
    target: targetLabel,
    completed: state.done,
    startedAt,
    finishedAt,
    status,
  });
  saveHistory(history);
  state.historyRecorded = true;
  state.setFinishedAt = finishedAt;
}

function resetCurrentSet() {
  if (state.done > 0 && !state.historyRecorded) {
    addHistorySet({
      status:
        state.targetType === "count" && state.done >= state.target
          ? "Completed"
          : "Reset",
    });
  }
  stopAutoPlay();
  state.done = 0;
  state.lastTapAt = 0;
  state.setStartedAt = 0;
  state.setFinishedAt = 0;
  state.historyRecorded = false;
  saveState();
  render();
}

function formatTime(time) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(time));
}

function formatDuration(start, finish) {
  const totalSeconds = Math.max(0, Math.round((finish - start) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderHistory() {
  const history = cleanHistory();
  elements.historyTotal.textContent = `${history.length} set${history.length === 1 ? "" : "s"}`;
  if (!history.length) {
    elements.historyList.innerHTML = `<p class="history-empty">No completed or reset sets in the last 24 hours.</p>`;
    return;
  }
  elements.historyList.innerHTML = history
    .map(
      (item, index) => `
    <article class="history-item">
      <div class="history-header">
        <strong>Set #${history.length - index}</strong>
        <span class="history-pill ${item.status === "Completed" ? "completed" : "reset"}">${item.status}</span>
      </div>
      <div class="history-details">
        <span>Target: <b>${item.target}</b></span>
        <span>Count Done: <b>${item.completed}</b></span>
        <span>Start: <b>${formatTime(item.startedAt)}</b></span>
        <span>Time Spent: <b>${formatDuration(item.startedAt, item.finishedAt)}</b></span>
      </div>
    </article>
  `,
    )
    .join("");
}

function getCooldownLeft() {
  const elapsedSeconds = (Date.now() - state.lastTapAt) / 1000;
  return Math.max(0, Math.ceil(COOLDOWN_SECONDS - elapsedSeconds));
}

function updateUIForTargetType() {
  elements.targetTypeSelect.value = state.targetType;
  if (state.targetType === "time") {
    elements.presetRowCount.classList.add("hidden");
    elements.presetRowTime.classList.remove("hidden");
    elements.targetInput.placeholder = "Example: 30";
  } else {
    elements.presetRowCount.classList.remove("hidden");
    elements.presetRowTime.classList.add("hidden");
    elements.targetInput.placeholder = "Example: 108";
  }
}

function render() {
  const ringLength = 427;
  let progress = 0;
  let isDone = false;

  updateUIForTargetType();

  // Progress logic based on Time vs Count
  if (state.targetType === "time") {
    const elapsed = state.setStartedAt ? Date.now() - state.setStartedAt : 0;
    const targetMs = state.target * 60 * 1000;
    const timeLeft = Math.max(targetMs - elapsed, 0);

    progress = state.setStartedAt ? Math.min(elapsed / targetMs, 1) : 0;

    // In Time Mode, you are completely 'done' once history is recorded.
    isDone = state.historyRecorded;

    elements.targetText.textContent = `${state.target}m`;
    elements.leftCount.textContent = `${Math.ceil(timeLeft / 60000)}m`;
  } else {
    const left = Math.max(state.target - state.done, 0);
    progress = state.target > 0 ? Math.min(state.done / state.target, 1) : 0;
    isDone = state.done >= state.target;

    elements.targetText.textContent = state.target;
    elements.leftCount.textContent = left;
  }

  // Update elements
  elements.doneCount.textContent = state.done;
  elements.targetInput.value = state.target;
  elements.progressCircle.style.strokeDashoffset =
    ringLength - ringLength * progress;

  if (isDone) {
    elements.tapBtn.disabled = true;
    elements.autoPlayBtn.disabled = true;
    elements.cooldownText.textContent = "Done";
    elements.message.textContent =
      "Target completed. Saved in history. Reset to start next set.";
  } else if (!isAutoPlaying) {
    const cooldownLeft = getCooldownLeft();
    if (cooldownLeft > 0) {
      elements.tapBtn.disabled = true;
      elements.cooldownText.textContent = `${cooldownLeft}s`;
      elements.message.textContent = `Wait ${cooldownLeft}s for next manual tap.`;
    } else {
      elements.tapBtn.disabled = false;
      elements.cooldownText.textContent = "Ready";
      elements.message.textContent = `Tap manually, or select an audio track below for auto-counting.`;
    }
    elements.autoPlayBtn.disabled = !currentAudioId;
  } else {
    // Auto-play state
    elements.cooldownText.textContent = "Auto";
    elements.message.textContent = "Auto-play is running...";
  }

  elements.seeTimeBtn.disabled = state.done === 0;
  saveState();
  renderHistory();
}

function startCooldownClock() {
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    let needsRender = false;

    // Check manual completion for Time mode if user walks away or isn't auto-playing
    if (
      state.targetType === "time" &&
      state.setStartedAt &&
      !state.historyRecorded
    ) {
      const elapsed = Date.now() - state.setStartedAt;
      if (elapsed >= state.target * 60 * 1000) {
        if (!isAutoPlaying) {
          addHistorySet({ status: "Completed", finishedAt: Date.now() });
          playCompletionSound();
        }
      }
      needsRender = true; // Always true to animate progress circle
    }

    if (getCooldownLeft() > 0 || needsRender || isAutoPlaying) {
      render();
    } else {
      render();
      if (state.targetType === "count" && !isAutoPlaying) {
        clearInterval(cooldownTimer);
      }
    }
  }, 100);
}

function processTap(bypassCooldown = false) {
  if (!bypassCooldown && getCooldownLeft() > 0) return;

  if (state.targetType === "count" && state.done >= state.target) return;
  if (state.targetType === "time" && state.historyRecorded) return;

  if (!state.setStartedAt || state.done === 0) {
    state.setStartedAt = Date.now();
    state.setFinishedAt = 0;
    state.historyRecorded = false;
  }

  state.done += 1;
  state.lastTapAt = Date.now();

  // Handle immediate completion if goal is Count
  if (
    state.targetType === "count" &&
    state.done >= state.target &&
    !state.historyRecorded
  ) {
    addHistorySet({ status: "Completed", finishedAt: state.lastTapAt });
    playCompletionSound();
  }
  // Note: Time-based completion checks are managed in the clock/interval & audio player event

  saveState();
  render();
  if (!bypassCooldown) startCooldownClock();
}

elements.tapBtn.addEventListener("click", () => processTap(false));

function updateDialogStats() {
  if (!state.setStartedAt) return;
  const now = Date.now();
  elements.diagCount.textContent = state.done;
  elements.diagElapsed.textContent = formatDuration(state.setStartedAt, now);
  const totalSeconds = (now - state.setStartedAt) / 1000;
  elements.diagAvg.textContent =
    state.done > 0 ? `${(totalSeconds / state.done).toFixed(1)}s` : "0.0s";
}

elements.seeTimeBtn.addEventListener("click", () => {
  if (state.done === 0 || !state.setStartedAt) return;
  updateDialogStats();
  elements.timeDialog.showModal();
  dialogTimer = setInterval(updateDialogStats, 1000);
});

elements.closeDialogBtn.addEventListener("click", () => {
  clearInterval(dialogTimer);
  elements.timeDialog.close();
});

// Changing Goal Type
elements.targetTypeSelect.addEventListener("change", (e) => {
  state.targetType = e.target.value;
  state.target = state.targetType === "time" ? 15 : 108; // Reset sensible defaults
  resetCurrentSet();
});

function setTarget(value) {
  const nextTarget = Number.parseInt(value, 10);
  if (!Number.isFinite(nextTarget) || nextTarget < 1) return;
  state.target = nextTarget;

  if (state.targetType === "count") {
    state.done = Math.min(state.done, state.target);
  }

  if (state.done === 0) {
    state.setStartedAt = 0;
    state.setFinishedAt = 0;
    state.historyRecorded = false;
  }

  if (
    state.targetType === "count" &&
    state.done >= state.target &&
    !state.historyRecorded
  ) {
    addHistorySet({ status: "Completed" });
  }

  saveState();
  render();
  startCooldownClock(); // Trigger clock to update UI loops immediately
}

elements.targetForm.addEventListener("submit", (e) => {
  e.preventDefault();
  setTarget(elements.targetInput.value);
});

document
  .querySelectorAll(".preset-btn")
  .forEach((btn) =>
    btn.addEventListener("click", () => setTarget(btn.dataset.target)),
  );
elements.resetBtn.addEventListener("click", resetCurrentSet);
elements.clearHistoryBtn.addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
});

// INSTALLATION
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  elements.installBanner.classList.remove("hidden");
});

elements.installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === "accepted") elements.installBanner.classList.add("hidden");
  deferredInstallPrompt = null;
});

window.addEventListener("appinstalled", () => {
  elements.installBanner.classList.add("hidden");
  deferredInstallPrompt = null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

// Init
initAudioDB().then(() => loadLibrary());
render();
startCooldownClock();
setInterval(() => {
  cleanHistory();
  renderHistory();
}, 60 * 1000);
