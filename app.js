(() => {
  "use strict";

  const STORAGE_KEY = "loteria-state-v1";
  const SPIN_DURATION_MS = 1200;
  const SPIN_TICK_MS = 80;

  const configScreen = document.getElementById("config-screen");
  const configForm = document.getElementById("config-form");
  const minInput = document.getElementById("min-input");
  const maxInput = document.getElementById("max-input");
  const configError = document.getElementById("config-error");

  const drawScreen = document.getElementById("draw-screen");
  const rangeLabel = document.getElementById("range-label");
  const resetBtn = document.getElementById("reset-btn");
  const drawArea = document.getElementById("draw-area");
  const currentNumberEl = document.getElementById("current-number");
  const drawHint = document.getElementById("draw-hint");
  const poolStatus = document.getElementById("pool-status");
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");

  /** @type {{min:number, max:number, pool:number[], history:number[]}|null} */
  let state = null;
  let spinning = false;
  let audioCtx = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.min === "number" &&
        typeof parsed.max === "number" &&
        Array.isArray(parsed.pool) &&
        Array.isArray(parsed.history)
      ) {
        return parsed;
      }
    } catch (e) {
      // ignore corrupted state
    }
    return null;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function buildPool(min, max) {
    const pool = [];
    for (let n = min; n <= max; n++) pool.push(n);
    return pool;
  }

  function showConfigScreen() {
    configScreen.hidden = false;
    drawScreen.hidden = true;
  }

  function showDrawScreen() {
    configScreen.hidden = true;
    drawScreen.hidden = false;
  }

  const BALL_COLOR_COUNT = 5;

  function ballColorClass(number) {
    const idx = ((number % BALL_COLOR_COUNT) + BALL_COLOR_COUNT) % BALL_COLOR_COUNT;
    return `ball-${idx}`;
  }

  function renderDrawScreen() {
    rangeLabel.textContent = `Rango: ${state.min}–${state.max}`;

    historyList.innerHTML = "";
    for (let i = state.history.length - 1; i >= 0; i--) {
      const number = state.history[i];
      const li = document.createElement("li");
      li.className = `ball ${ballColorClass(number)}`;
      li.textContent = number;
      historyList.appendChild(li);
    }
    historyEmpty.hidden = state.history.length > 0;

    if (state.history.length > 0) {
      currentNumberEl.textContent = state.history[state.history.length - 1];
    } else {
      currentNumberEl.textContent = "?";
    }

    updatePoolStatus();
  }

  function updatePoolStatus() {
    if (state.pool.length === 0) {
      poolStatus.textContent = "¡Sorteo completo! No quedan números por sortear.";
      poolStatus.classList.add("complete");
      drawArea.disabled = true;
      drawHint.textContent = "Sorteo finalizado";
    } else {
      poolStatus.textContent = `Quedan ${state.pool.length} número${state.pool.length === 1 ? "" : "s"} por sortear.`;
      poolStatus.classList.remove("complete");
      drawArea.disabled = false;
      drawHint.textContent = "Tocá para sortear";
    }
  }

  function startNewSorteo(min, max) {
    state = { min, max, pool: buildPool(min, max), history: [] };
    saveState();
    renderDrawScreen();
    showDrawScreen();
  }

  function resetSorteo() {
    clearState();
    state = null;
    configForm.reset();
    configError.hidden = true;
    showConfigScreen();
  }

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTick(pitch) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = pitch;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch (e) {
      // audio not available, ignore
    }
  }

  function playFinalChime() {
    try {
      const ctx = getAudioCtx();
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = ctx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch (e) {
      // ignore
    }
  }

  function drawNumber() {
    if (spinning || !state || state.pool.length === 0) return;
    getAudioCtx(); // create/resume within the click gesture for autoplay policies
    spinning = true;
    drawArea.disabled = true;
    drawArea.classList.add("spinning");
    drawHint.textContent = "Sorteando...";

    const elapsed = { t: 0 };
    const spinInterval = setInterval(() => {
      elapsed.t += SPIN_TICK_MS;
      const randomFromPool = state.pool[Math.floor(Math.random() * state.pool.length)];
      currentNumberEl.textContent = randomFromPool;
      playTick(220 + Math.random() * 300);
    }, SPIN_TICK_MS);

    setTimeout(() => {
      clearInterval(spinInterval);

      const idx = Math.floor(Math.random() * state.pool.length);
      const number = state.pool[idx];
      state.pool.splice(idx, 1);
      state.history.push(number);
      saveState();

      currentNumberEl.textContent = number;
      playFinalChime();

      drawArea.classList.remove("spinning");
      spinning = false;
      renderDrawScreen();
    }, SPIN_DURATION_MS);
  }

  configForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const min = parseInt(minInput.value, 10);
    const max = parseInt(maxInput.value, 10);

    if (Number.isNaN(min) || Number.isNaN(max)) {
      configError.textContent = "Ingresá números válidos.";
      configError.hidden = false;
      return;
    }
    if (min > max) {
      configError.textContent = "El mínimo no puede ser mayor que el máximo.";
      configError.hidden = false;
      return;
    }

    configError.hidden = true;
    startNewSorteo(min, max);
  });

  drawArea.addEventListener("click", drawNumber);

  resetBtn.addEventListener("click", () => {
    if (spinning) return;
    resetSorteo();
  });

  const restored = loadState();
  if (restored) {
    state = restored;
    renderDrawScreen();
    showDrawScreen();
  } else {
    showConfigScreen();
  }
})();
