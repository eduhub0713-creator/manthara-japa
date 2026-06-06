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

  // NEW INSTALL ELEMENTS
  installWrapper: document.getElementById("installWrapper"),
  mainInstallBtn: document.getElementById("mainInstallBtn"),
  iosInstallText: document.getElementById("iosInstallText"),

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

// --- DURATION CONFIGURATION (In Seconds) ---
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
  "0514 (19).MP3": 120,
  "0514 (20).MP3": 120,
  "0514 (21).MP3": 120,
  "0514 (22).MP3": 120,
};

// Calculates actual target taps based on if a Loop is active
function getActualTarget() {
  if (state.targetType === "time") return state.target;
  if (isLoopMode && loopQueue.length > 0) {
    // Number of Sets * Number of Tracks in the Set
    return state.target * loopQueue.length;
  }
  return state.target;
}

// Gather preloaded options to build loops dynamically
const getPresetOptions = () =>
  Array.from(elements.presetAudioSelect.options).filter((o) => o.value !== "");

// Build the specific "Loop 1" sequence
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

// Build the "Loop 2" sequence (Tracks 19, 20, 21, 22 played in a row)
function buildLoopTwo() {
  loopQueue = [];
  const options = getPresetOptions();

  const addTrack = (val) => {
    const opt = options.find((o) => o.value === val);
    if (opt) loopQueue.push({ src: opt.value, name: opt.text });
  };

  addTrack("0514 (19).MP3");
  addTrack("0514 (20).MP3");
  addTrack("0514 (21).MP3");
  addTrack("0514 (22).MP3");
}

// --- 1. HANDLE SINGLE PRESET AUDIO SELECTION ---
elements.presetAudioSelect.addEventListener("change", (e) => {
  const val = e.target.value;

  if (val) {
    // Completely clear out any loop data
    elements.loopSelect.value = "";
    isLoopMode = false;
    loopQueue = [];
    currentLoopIndex = 0;

    // Set as a unique single track
    currentAudioId = "preset";
    currentAudioName = e.target.options[e.target.selectedIndex].text;

    // Load audio and unlock button
    audioPlayer.src = val;
    audioPlayer.playbackRate = parseFloat(elements.speedSelect.value) || 1;
    audioPlayer.currentTime = 0;

    elements.autoPlayBtn.disabled = false;
  } else {
    // Only lock the button if we aren't currently running a loop
    if (!isLoopMode) {
      currentAudioId = null;
      currentAudioName = "Manual";
      audioPlayer.src = "";
      stopAutoPlay();
      elements.autoPlayBtn.disabled = true;
    }
  }

  render();
});

// --- 2. HANDLE LOOP SET SELECTION ---
elements.loopSelect.addEventListener("change", (e) => {
  const val = e.target.value;

  if (val === "loop1" || val === "loop2") {
    // Completely clear out single track selection
    elements.presetAudioSelect.value = "";

    // Set as a unique loop
    isLoopMode = true;
    currentAudioId = "loop"; // We use "loop" instead of "preset" to avoid confusing the UI

    if (val === "loop1") {
      currentAudioName = "Loop - Set 1";
      buildLoopOne();
    } else if (val === "loop2") {
      currentAudioName = "Loop - Set 2";
      buildLoopTwo();
    }

    currentLoopIndex = 0;

    // Default to 1 Set when a new loop is picked
    if (state.targetType === "count") {
      state.target = 1;
    }

    // Reset the tracker board
    resetCurrentSet();

    // Load the first track of the loop and unlock the button
    if (loopQueue.length > 0) {
      audioPlayer.src = loopQueue[0].src;
      audioPlayer.playbackRate = parseFloat(elements.speedSelect.value) || 1;
      audioPlayer.currentTime = 0;
    }

    elements.autoPlayBtn.disabled = false;
  } else {
    // If the user selects the empty "-- Choose Loop Set --" option
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
  const actualTarget = getActualTarget();
  if (state.targetType === "count" && state.done >= actualTarget) return;
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

  const actualTarget = getActualTarget();
  const isDone =
    state.targetType === "count"
      ? state.done >= actualTarget
      : state.historyRecorded;
  elements.autoPlayBtn.disabled = !currentAudioId || isDone;
  render();
}

function playNextAudioLoop() {
  if (!isAutoPlaying) {
    stopAutoPlay();
    return;
  }

  const actualTarget = getActualTarget();
  if (state.targetType === "count" && state.done >= actualTarget) {
    stopAutoPlay();
    return;
  }

  if (isLoopMode) {
    audioPlayer.src = loopQueue[currentLoopIndex].src;
    currentAudioName = `Loop: ${loopQueue[currentLoopIndex].name}`;
    audioPlayer.playbackRate = parseFloat(elements.speedSelect.value);
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
  const actualTarget = getActualTarget();

  if (state.targetType === "count" && state.done >= actualTarget) {
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
    // If loop mode, cycle to next track seamlessly
    if (isLoopMode) {
      currentLoopIndex = (currentLoopIndex + 1) % loopQueue.length;
    }

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
  elements.targetInput.disabled = false; // Always allow input now

  if (state.targetType === "time") {
    elements.presetRowCount.classList.add("hidden");
    elements.presetRowTime.classList.remove("hidden");
    elements.targetInput.placeholder = "Example: 30";
  } else {
    elements.presetRowCount.classList.remove("hidden");
    elements.presetRowTime.classList.add("hidden");

    // Change placeholder to indicate "Sets" for loops
    if (isLoopMode) {
      elements.targetInput.placeholder = "Number of Sets (e.g. 5)";
    } else {
      elements.targetInput.placeholder = "Example: 108";
    }
  }
}

function render() {
  const ringLength = 427;
  let progress = 0;
  let isDone = false;

  updateUIForTargetType();
  const actualTarget = getActualTarget();

  if (state.targetType === "count" && currentAudioId) {
    let duration = 0;
    let totalSeconds = 0;
    const speed = parseFloat(elements.speedSelect.value) || 1;
    const left = Math.max(actualTarget - state.done, 0);

    if (left === 0) {
      elements.estTimeCard.classList.remove("hidden");
      elements.estTimeText.textContent = "Done";
    } else if (isLoopMode && loopQueue.length > 0) {
      elements.estTimeCard.classList.remove("hidden");

      // Accurately calculate time for all remaining loop sets & partial tracks
      let cycleDuration = 0;
      loopQueue.forEach((track) => {
        const d = presetDurations[track.src] || 120;
        cycleDuration += d / speed + 1000 / 1000;
      });

      const fullCyclesLeft = Math.floor(left / loopQueue.length);
      const partialTracksLeft = left % loopQueue.length;

      totalSeconds += fullCyclesLeft * cycleDuration;

      let tempIndex = currentLoopIndex;
      for (let i = 0; i < partialTracksLeft; i++) {
        const track = loopQueue[tempIndex];
        const d = presetDurations[track.src] || 120;
        totalSeconds += d / speed + 1000 / 1000;
        tempIndex = (tempIndex + 1) % loopQueue.length;
      }

      totalSeconds = Math.ceil(totalSeconds);

      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      if (h > 0) elements.estTimeText.textContent = `${h}h ${m}m`;
      else if (m > 0) elements.estTimeText.textContent = `${m}m ${s}s`;
      else elements.estTimeText.textContent = `${s}s`;
    } else {
      if (currentAudioId === "preset" && elements.presetAudioSelect.value) {
        duration =
          presetDurations[elements.presetAudioSelect.value] ||
          audioPlayer.duration;
      } else if (audioPlayer.duration && !isNaN(audioPlayer.duration)) {
        duration = audioPlayer.duration;
      }

      if (duration) {
        elements.estTimeCard.classList.remove("hidden");
        const loopTime = duration / speed + BREATH_GAP_MS / 1000;
        totalSeconds = Math.ceil(left * loopTime);

        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) elements.estTimeText.textContent = `${h}h ${m}m`;
        else if (m > 0) elements.estTimeText.textContent = `${m}m ${s}s`;
        else elements.estTimeText.textContent = `${s}s`;
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
    const left = Math.max(actualTarget - state.done, 0);
    progress = actualTarget > 0 ? Math.min(state.done / actualTarget, 1) : 0;
    isDone = state.done >= actualTarget;

    elements.targetText.textContent = actualTarget;
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
  const nextTarget = Number.parseInt(value, 10);
  if (!Number.isFinite(nextTarget) || nextTarget < 1) return;
  state.target = nextTarget;

  const actualTarget = getActualTarget();

  if (state.targetType === "count") {
    state.done = Math.min(state.done, actualTarget);
  }

  if (state.done === 0) {
    state.setStartedAt = 0;
    state.setFinishedAt = 0;
    state.historyRecorded = false;
  }

  if (
    state.targetType === "count" &&
    state.done >= actualTarget &&
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

// --- UNIVERSAL INSTALLATION LOGIC ---
// 1. Android & Desktop (Chrome, Edge, Brave)
window.addEventListener("beforeinstallprompt", (e) => {
  // Prevent Chrome from showing the tiny default pop-up
  e.preventDefault();
  // Save the event to trigger it later
  deferredInstallPrompt = e;

  // Show our big custom install button if the element exists
  if (elements.installWrapper) {
    elements.installWrapper.classList.remove("hidden");
  }
});

if (elements.mainInstallBtn) {
  elements.mainInstallBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;

    // Show the native Android/PC install prompt
    deferredInstallPrompt.prompt();

    // Wait for the user to click "Install"
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      // Hide the button once they accept
      elements.installWrapper.classList.add("hidden");
    }

    deferredInstallPrompt = null;
  });
}

// Hide the button permanently if the app is successfully installed
window.addEventListener("appinstalled", () => {
  if (elements.installWrapper) {
    elements.installWrapper.classList.add("hidden");
  }
  deferredInstallPrompt = null;
});

// 2. Apple iOS Fallback
const isIos = () =>
  /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
const isInStandaloneMode = () =>
  "standalone" in window.navigator && window.navigator.standalone;

if (isIos() && !isInStandaloneMode()) {
  if (elements.installWrapper) {
    elements.installWrapper.classList.remove("hidden");
  }
  if (elements.mainInstallBtn) {
    elements.mainInstallBtn.classList.add("hidden");
  }
  if (elements.iosInstallText) {
    elements.iosInstallText.classList.remove("hidden");
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

// Init
initAudioDB().then(() => loadLibrary());
render();
startCooldownClock();
