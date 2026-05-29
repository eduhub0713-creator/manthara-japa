// --- CONFIGURATION ---
const COOLDOWN_SECONDS = 1;
const BREATH_GAP_MS = 400; // The natural pause for standard plays
const STORAGE_KEY = "mantharaCounterState.v7";
const HISTORY_KEY = "mantharaCounterHistory.v7";

const defaultState = {
  targetType: "count",
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
  estTimeCard: document.getElementById("estTimeCard"),
  estTimeText: document.getElementById("estTimeText"),
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
  presetAudioSelect: document.getElementById("presetAudioSelect"),
  loopSelect: document.getElementById("loopSelect"),
};

let state = loadState();
let deferredInstallPrompt = null;
let cooldownTimer = null;
let dialogTimer = null;

// --- AUDIO SYSTEM ---
let audioDB = null;
let currentAudioId = null;
let currentAudioBlobUrl = null;
let currentAudioName = "Manual";
let isAutoPlaying = false;
const audioPlayer = new Audio();

// --- NEW LOOP STATE ---
let isLoopMode = false;
let loopQueue = [];
let currentLoopIndex = 0;

audioPlayer.addEventListener("loadedmetadata", render);

// Gather preloaded options to build loops dynamically
const getPresetOptions = () =>
  Array.from(elements.presetAudioSelect.options).filter((o) => o.value !== "");

// Build the specific "Loop 1" sequence
function buildLoopOne() {
  loopQueue = [];
  const options = getPresetOptions();

  const addTrack = (val, times) => {
    const opt = options.find((o) => o.value === val);
    if (opt) {
      for (let i = 0; i < times; i++) {
        loopQueue.push({ src: opt.value, name: opt.text });
      }
    }
  };

  // Specific Order as requested
  addTrack("0514 (3).MP3", 3);
  addTrack("0514 (4).MP3", 3);
  addTrack("0514 (5).MP3", 3);
  addTrack("0514 (18).MP3", 1);
  addTrack("0514 (11).MP3", 1);
  addTrack("0514 (9).MP3", 1);

  const specificValues = [
    "0514 (3).MP3",
    "0514 (4).MP3",
    "0514 (5).MP3",
    "0514 (18).MP3",
    "0514 (11).MP3",
    "0514 (9).MP3",
  ];

  // The rest played exactly 1 time
  options.forEach((opt) => {
    if (!specificValues.includes(opt.value)) {
      addTrack(opt.value, 1);
    }
  });
}

// Handle Loop Selection
elements.loopSelect.addEventListener("change", (e) => {
  const val = e.target.value;
  if (val === "loop1") {
    elements.presetAudioSelect.value = ""; // Clear standard preset

    isLoopMode = true;
    currentAudioId = "preset";
    currentAudioName = "Loop - Set 1";
    buildLoopOne();
    currentLoopIndex = 0;

    // Force count target to exactly match the playlist length (25)
    state.targetType = "count";
    state.target = loopQueue.length;
    resetCurrentSet();

    audioPlayer.src = loopQueue[0].src;
    audioPlayer.playbackRate = parseFloat(elements.speedSelect.value);
    elements.autoPlayBtn.disabled = false;
  } else {
    isLoopMode = false;
    loopQueue = [];
    if (!elements.presetAudioSelect.value) {
      currentAudioId = null;
      currentAudioName = "Manual";
      audioPlayer.src = "";
      stopAutoPlay();
      elements.autoPlayBtn.disabled = true;
    }
  }
  render();
});

// Handle Standard Preloaded Dropdown
elements.presetAudioSelect.addEventListener("change", (e) => {
  const fileName = e.target.value;
  if (fileName) {
    elements.loopSelect.value = ""; // Clear loop
    isLoopMode = false;
    loopQueue = [];
    currentLoopIndex = 0;

    currentAudioId = "preset";
    currentAudioName = e.target.options[e.target.selectedIndex].text;

    if (currentAudioBlobUrl) {
      URL.revokeObjectURL(currentAudioBlobUrl);
      currentAudioBlobUrl = null;
    }

    audioPlayer.src = fileName;
    audioPlayer.playbackRate = parseFloat(elements.speedSelect.value);
    elements.autoPlayBtn.disabled = false;

    loadLibrary();
    render();
  } else {
    if (currentAudioId === "preset" && !isLoopMode) {
      currentAudioId = null;
      currentAudioName = "Manual";
      audioPlayer.src = "";
      stopAutoPlay();
      elements.autoPlayBtn.disabled = true;
      render();
    }
  }
});

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
        '<p class="history-empty">No custom audio added yet.</p>';
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

    document.querySelectorAll(".audio-item").forEach((item) => {
      item.addEventListener("click", function (e) {
        if (e.target.classList.contains("delete-audio-btn")) return;
        selectAudio(Number(this.dataset.id));
      });
    });

    document.querySelectorAll(".delete-audio-btn").forEach((btn) => {
      btn.addEventListener("click", async function () {
        await deleteAudio(Number(this.dataset.id));
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
      currentAudioName = "Manual";
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

      elements.loopSelect.value = "";
      elements.presetAudioSelect.value = "";
      isLoopMode = false;
      loopQueue = [];

      currentAudioId = id;
      currentAudioName = req.result.name;
      currentAudioBlobUrl = URL.createObjectURL(req.result.blob);
      audioPlayer.src = currentAudioBlobUrl;
      audioPlayer.playbackRate = parseFloat(elements.speedSelect.value);
      elements.autoPlayBtn.disabled = false;

      loadLibrary();
    }
  };
}

elements.audioUpload.addEventListener("change", (e) => {
  const files = e.target.files;
  for (let file of files) {
    saveAudioFile(file);
  }
  e.target.value = "";
});

elements.speedSelect.addEventListener("change", (e) => {
  audioPlayer.playbackRate = parseFloat(e.target.value);
  render();
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
    elements.tapBtn.disabled = true;
    playNextAudioLoop();
  }
}

function stopAutoPlay() {
  isAutoPlaying = false;
  audioPlayer.pause();

  if (!isLoopMode) {
    audioPlayer.currentTime = 0;
  }

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

  if (isLoopMode) {
    if (currentLoopIndex >= loopQueue.length) {
      stopAutoPlay();
      return;
    }
    audioPlayer.src = loopQueue[currentLoopIndex].src;
    currentAudioName = `Loop: ${loopQueue[currentLoopIndex].name}`;
    audioPlayer.playbackRate = parseFloat(elements.speedSelect.value);
  }

  if (state.targetType === "count" && state.done >= state.target) {
    stopAutoPlay();
    return;
  }

  audioPlayer.currentTime = 0;
  audioPlayer.play().catch((e) => {
    console.error("Auto-play blocked:", e);
    stopAutoPlay();
    elements.message.textContent =
      "Auto-play blocked by browser. Interact with the page first.";
  });
}

// Handle audio ends, tracking loops, gaps, and progress
audioPlayer.addEventListener("ended", () => {
  if (!isAutoPlaying) return;

  processTap(true);

  let shouldStop = false;

  if (isLoopMode) {
    currentLoopIndex++;
    if (currentLoopIndex >= loopQueue.length) {
      shouldStop = true;
    }
  }

  if (state.targetType === "count" && state.done >= state.target) {
    shouldStop = true;
  } else if (state.targetType === "time" && state.setStartedAt) {
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
    // 1000ms strict pause for Loops, variable breath gap for standard plays
    const pauseTime = isLoopMode ? 1000 : BREATH_GAP_MS;
    setTimeout(() => {
      if (isAutoPlaying) playNextAudioLoop();
    }, pauseTime);
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
  } catch (e) {}
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

function addHistorySet({ status = "Completed", finishedAt = Date.now() } = {}) {
  if (state.done <= 0) return;
  const history = loadHistory();
  const startedAt = state.setStartedAt || finishedAt;
  const targetLabel =
    state.targetType === "time" ? `${state.target}m` : state.target;

  const finalAudioName = isLoopMode ? "Loop - Set 1" : currentAudioName;

  history.unshift({
    id: `${startedAt}-${finishedAt}-${Math.random().toString(16).slice(2)}`,
    target: targetLabel,
    completed: state.done,
    startedAt,
    finishedAt,
    status,
    audioName: finalAudioName,
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

  // Reset loop to start
  currentLoopIndex = 0;
  if (isLoopMode && loopQueue.length > 0) {
    audioPlayer.src = loopQueue[0].src;
    audioPlayer.playbackRate = parseFloat(elements.speedSelect.value);
  }

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
  const history = loadHistory();
  elements.historyTotal.textContent = `${history.length} set${history.length === 1 ? "" : "s"}`;

  if (!history.length) {
    elements.historyList.innerHTML = `<p class="history-empty">No history recorded yet.</p>`;
    return;
  }

  const grouped = {};
  history.forEach((item) => {
    const d = new Date(item.startedAt);
    const dateKey = d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(item);
  });

  let html = "";
  for (const [date, items] of Object.entries(grouped)) {
    html += `<h3 class="history-date-header">${date}</h3>`;
    html += items
      .map((item) => {
        const safeAudioName = item.audioName
          ? item.audioName.replace(/"/g, "&quot;")
          : "Manual";
        return `
      <article class="history-item">
        <div class="history-header">
          <strong>Set</strong>
          <span class="history-pill ${item.status === "Completed" ? "completed" : "reset"}">${item.status}</span>
        </div>
        <div class="history-details">
          <span>Target: <b>${item.target}</b></span>
          <span>Done: <b>${item.completed}</b></span>
          <span style="grid-column: span 2">Audio: <b class="audio-name-trunc" title="${safeAudioName}">${safeAudioName}</b></span>
          <span>Time: <b>${formatDuration(item.startedAt, item.finishedAt)}</b></span>
          <span>Start: <b>${formatTime(item.startedAt)}</b></span>
        </div>
      </article>
      `;
      })
      .join("");
  }
  elements.historyList.innerHTML = html;
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
    elements.targetInput.disabled = false;
  } else {
    elements.presetRowCount.classList.remove("hidden");
    elements.presetRowTime.classList.add("hidden");
    elements.targetInput.placeholder = "Example: 108";

    // Lock target if in loop mode
    if (isLoopMode) {
      elements.targetInput.disabled = true;
    } else {
      elements.targetInput.disabled = false;
    }
  }
}

function render() {
  const ringLength = 427;
  let progress = 0;
  let isDone = false;

  updateUIForTargetType();

  const presetDurations = {
    "0514.MP3": 92,
    "0514 (1).MP3": 78,
    "0514 (2).MP3": 118,
    "0514 (3).MP3": 16,
    "0514 (4).MP3": 14,
    "0514 (5).MP3": 41,
    "0514 (6).MP3": 204,
    "0514 (7).MP3": 149,
    "0514 (8).MP3": 120,
    "0514 (9).MP3": 420,
    "0514 (10).MP3": 168,
    "0514 (11).MP3": 175,
    "0514 (12).MP3": 256,
    "0514 (13).MP3": 306,
    "0514 (14).MP3": 310,
    "0514 (15).MP3": 139,
    "0514 (16).MP3": 1724,
    "0514 (17).MP3": 374,
    "0514 (18).MP3": 243,
  };

  if (state.targetType === "count" && currentAudioId) {
    if (isLoopMode) {
      // Hide Est Time for Loop because playlist durations vary wildly
      elements.estTimeCard.classList.add("hidden");
    } else {
      let duration = 0;
      if (currentAudioId === "preset" && elements.presetAudioSelect.value) {
        duration =
          presetDurations[elements.presetAudioSelect.value] ||
          audioPlayer.duration;
      } else if (audioPlayer.duration && !isNaN(audioPlayer.duration)) {
        duration = audioPlayer.duration;
      }

      if (duration) {
        elements.estTimeCard.classList.remove("hidden");
        const speed = parseFloat(elements.speedSelect.value) || 1;
        const loopTime = duration / speed + BREATH_GAP_MS / 1000;
        const left = Math.max(state.target - state.done, 0);
        const totalSeconds = Math.ceil(left * loopTime);

        if (left === 0) {
          elements.estTimeText.textContent = "Done";
        } else {
          const h = Math.floor(totalSeconds / 3600);
          const m = Math.floor((totalSeconds % 3600) / 60);
          const s = totalSeconds % 60;
          if (h > 0) elements.estTimeText.textContent = `${h}h ${m}m`;
          else if (m > 0) elements.estTimeText.textContent = `${m}m ${s}s`;
          else elements.estTimeText.textContent = `${s}s`;
        }
      } else {
        elements.estTimeCard.classList.add("hidden");
      }
    }
  } else {
    elements.estTimeCard.classList.add("hidden");
  }

  if (state.targetType === "time") {
    const elapsed = state.setStartedAt ? Date.now() - state.setStartedAt : 0;
    const targetMs = state.target * 60 * 1000;
    const timeLeft = Math.max(targetMs - elapsed, 0);

    progress = state.setStartedAt ? Math.min(elapsed / targetMs, 1) : 0;
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
    elements.cooldownText.textContent = "Auto";
    elements.message.textContent = isLoopMode
      ? `Playing Loop: Track ${currentLoopIndex + 1} of ${loopQueue.length}`
      : "Auto-play is running...";
  }

  elements.seeTimeBtn.disabled = state.done === 0;
  saveState();
  renderHistory();
}

function startCooldownClock() {
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    let needsRender = false;

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
      needsRender = true;
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

  if (
    state.targetType === "count" &&
    state.done >= state.target &&
    !state.historyRecorded
  ) {
    addHistorySet({ status: "Completed", finishedAt: state.lastTapAt });
    playCompletionSound();
  }

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

elements.targetTypeSelect.addEventListener("change", (e) => {
  if (isLoopMode) return; // Prevent changing types if locked in a loop
  state.targetType = e.target.value;
  state.target = state.targetType === "time" ? 15 : 108;
  resetCurrentSet();
});

function setTarget(value) {
  if (isLoopMode) return; // Prevent modifying target while a Loop is active

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
  startCooldownClock();
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
  // Check if the user is on a mobile device
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(
      navigator.userAgent,
    );

  if (isMobile) {
    // On mobile, let the browser's native "Add to Home Screen" prompt handle it.
    // We do NOT intercept it, so it will show up naturally.
    return;
  }

  // On desktop/PC, intercept the prompt and show your custom install banner
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
    navigator.serviceWorker.register("sw.js");
  });
}

// Init
initAudioDB().then(() => loadLibrary());
render();
startCooldownClock();
