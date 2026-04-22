const state = {
  source: "Waiting for data",
  sampleRate: 250,
  time: [],
  rawSignal: [],
  filteredSignal: [],
  peaks: [],
  rr: [],
  metrics: null,
  psd: [],
  qualityNote: "No analysis yet"
};

const metricDefinitions = [
  ["meanHr", "Mean HR", "beats/min"],
  ["meanNN", "Mean NN", "ms"],
  ["sdnn", "SDNN", "ms"],
  ["rmssd", "RMSSD", "ms"],
  ["pnn50", "pNN50", "%"],
  ["lf", "LF Power", "ms^2"],
  ["hf", "HF Power", "ms^2"],
  ["lfHf", "LF/HF", "ratio"],
  ["sd1", "SD1", "ms"],
  ["sd2", "SD2", "ms"]
];

const canvases = {
  ecg: document.getElementById("ecgCanvas"),
  rr: document.getElementById("rrCanvas"),
  poincare: document.getElementById("poincareCanvas"),
  psd: document.getElementById("psdCanvas")
};

const fileInput = document.getElementById("fileInput");
const demoButton = document.getElementById("demoButton");
const analyzeButton = document.getElementById("analyzeButton");
const sampleRateInput = document.getElementById("sampleRateInput");
const durationInput = document.getElementById("durationInput");

fileInput.addEventListener("change", handleFileUpload);
demoButton.addEventListener("click", loadSyntheticDemo);
analyzeButton.addEventListener("click", () => runAnalysis());

sampleRateInput.addEventListener("change", () => {
  const nextRate = Number(sampleRateInput.value);
  if (Number.isFinite(nextRate) && nextRate > 0) {
    state.sampleRate = nextRate;
  }
});

function setStatus() {
  document.getElementById("signalSource").textContent = state.source;
  document.getElementById("sampleCount").textContent = String(state.rawSignal.length);
  document.getElementById("beatCount").textContent = String(state.peaks.length);
  document.getElementById("qualityNote").textContent = state.qualityNote;
}

function setWaveformCaption(text) {
  document.getElementById("waveformCaption").textContent = text;
}

function renderMetrics() {
  const grid = document.getElementById("metricsGrid");
  if (!state.metrics) {
    grid.innerHTML = "";
    metricDefinitions.forEach(([, label, unit]) => {
      const card = document.createElement("article");
      card.innerHTML = `<span class="metric-label">${label}</span><strong class="metric-value">--</strong><span class="metric-context">${unit}</span>`;
      grid.appendChild(card);
    });
    return;
  }

  grid.innerHTML = "";
  metricDefinitions.forEach(([key, label, unit]) => {
    const value = state.metrics[key];
    const formatted = Number.isFinite(value) ? formatMetric(value, key) : "--";
    const card = document.createElement("article");
    card.innerHTML = `<span class="metric-label">${label}</span><strong class="metric-value">${formatted}</strong><span class="metric-context">${unit}</span>`;
    grid.appendChild(card);
  });
}

function formatMetric(value, key) {
  if (key === "lfHf") {
    return value.toFixed(2);
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseCsv(String(reader.result));
      state.time = parsed.time;
      state.rawSignal = parsed.signal;
      state.sampleRate = parsed.sampleRate || Number(sampleRateInput.value) || 250;
      sampleRateInput.value = String(state.sampleRate);
      state.source = file.name;
      runAnalysis();
    } catch (error) {
      window.alert(`Could not parse file: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,\t;]/).map((item) => item.trim()));

  const numericRows = rows.filter((parts) => parts.every((part) => !Number.isNaN(Number(part))));
  if (!numericRows.length) {
    throw new Error("No numeric ECG data found.");
  }

  let time = [];
  let signal = [];

  if (numericRows[0].length >= 2) {
    time = numericRows.map((row) => Number(row[0]));
    signal = numericRows.map((row) => Number(row[1]));
  } else {
    signal = numericRows.map((row) => Number(row[0]));
    const sr = Number(sampleRateInput.value) || 250;
    time = signal.map((_, index) => index / sr);
  }

  const sampleRate = inferSampleRate(time);
  return { time, signal, sampleRate };
}

function inferSampleRate(time) {
  if (time.length < 3) {
    return Number(sampleRateInput.value) || 250;
  }

  const deltas = [];
  for (let index = 1; index < Math.min(time.length, 1000); index += 1) {
    const delta = time[index] - time[index - 1];
    if (delta > 0) {
      deltas.push(delta);
    }
  }
  const meanDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  return meanDelta > 0 ? 1 / meanDelta : Number(sampleRateInput.value) || 250;
}

function loadSyntheticDemo() {
  const sampleRate = Number(sampleRateInput.value) || 250;
  const duration = Number(durationInput.value) || 60;
  const generated = generateSyntheticEcg(sampleRate, duration);
  state.sampleRate = sampleRate;
  state.time = generated.time;
  state.rawSignal = generated.signal;
  state.source = "Synthetic sinus rhythm demo";
  runAnalysis();
}

function generateSyntheticEcg(sampleRate, duration) {
  const totalSamples = sampleRate * duration;
  const time = [];
  const signal = [];
  let beatTime = 0.7;

  for (let index = 0; index < totalSamples; index += 1) {
    const t = index / sampleRate;
    time.push(t);

    const respiratory = 0.04 * Math.sin(2 * Math.PI * 0.2 * t);
    const baseline = 0.06 * Math.sin(2 * Math.PI * 0.33 * t);
    let value = respiratory + baseline;

    while (beatTime < t + 1.2 && beatTime < duration + 1) {
      const rr = 0.86 + 0.08 * Math.sin(2 * Math.PI * 0.08 * beatTime) + (Math.random() - 0.5) * 0.04;
      value += gaussian(t, beatTime - 0.18, 0.025, 0.14);
      value += gaussian(t, beatTime - 0.04, 0.012, -0.15);
      value += gaussian(t, beatTime, 0.015, 1.2);
      value += gaussian(t, beatTime + 0.03, 0.016, -0.26);
      value += gaussian(t, beatTime + 0.22, 0.06, 0.36);
      beatTime += rr;
    }

    value += (Math.random() - 0.5) * 0.035;
    signal.push(value);
  }

  return { time, signal };
}

function gaussian(x, center, width, amplitude) {
  return amplitude * Math.exp(-((x - center) ** 2) / (2 * width ** 2));
}

function runAnalysis() {
  if (!state.rawSignal.length) {
    window.alert("Load a signal first.");
    return;
  }

  state.filteredSignal = filterSignal(state.rawSignal, state.sampleRate);
  state.peaks = detectRPeaks(state.filteredSignal, state.sampleRate);
  state.rr = computeRrIntervals(state.peaks, state.time);
  state.metrics = computeHrvMetrics(state.rr);
  state.psd = computePsdFromRr(state.rr);
  state.qualityNote = assessSignalQuality();

  setStatus();
  renderMetrics();
  renderRrTable();
  drawAllCharts();
  setWaveformCaption(
    `${state.peaks.length} R-peaks found across ${state.time.at(-1)?.toFixed(1) || 0}s at ${state.sampleRate.toFixed(0)} Hz`
  );
}

function filterSignal(signal, sampleRate) {
  const baselineWindow = Math.max(3, Math.round(sampleRate * 0.2));
  const smoothWindow = Math.max(3, Math.round(sampleRate * 0.02));
  const baseline = movingAverage(signal, baselineWindow);
  const detrended = signal.map((value, index) => value - baseline[index]);
  return movingAverage(detrended, smoothWindow);
}

function movingAverage(signal, windowSize) {
  const result = new Array(signal.length).fill(0);
  let runningSum = 0;
  const queue = [];

  for (let index = 0; index < signal.length; index += 1) {
    runningSum += signal[index];
    queue.push(signal[index]);

    if (queue.length > windowSize) {
      runningSum -= queue.shift();
    }

    result[index] = runningSum / queue.length;
  }

  return result;
}

function detectRPeaks(signal, sampleRate) {
  let maxValue = -Infinity;
  let minValue = Infinity;
  signal.forEach((value) => {
    if (value > maxValue) {
      maxValue = value;
    }
    if (value < minValue) {
      minValue = value;
    }
  });
  const threshold = minValue + (maxValue - minValue) * 0.62;
  const refractory = Math.round(sampleRate * 0.24);
  const peaks = [];
  let lastPeak = -refractory;

  for (let index = 1; index < signal.length - 1; index += 1) {
    const current = signal[index];
    if (
      current > threshold &&
      current >= signal[index - 1] &&
      current > signal[index + 1] &&
      index - lastPeak >= refractory
    ) {
      let bestIndex = index;
      const searchLimit = Math.min(signal.length - 1, index + Math.round(sampleRate * 0.04));
      for (let cursor = index; cursor <= searchLimit; cursor += 1) {
        if (signal[cursor] > signal[bestIndex]) {
          bestIndex = cursor;
        }
      }
      peaks.push(bestIndex);
      lastPeak = bestIndex;
      index = bestIndex;
    }
  }

  return peaks;
}

function computeRrIntervals(peaks, time) {
  const rr = [];
  for (let index = 1; index < peaks.length; index += 1) {
    const currentTime = time[peaks[index]];
    const previousTime = time[peaks[index - 1]];
    const interval = (currentTime - previousTime) * 1000;
    if (interval >= 300 && interval <= 2000) {
      rr.push({
        beat: index,
        time: currentTime,
        rr: interval
      });
    }
  }
  return rr;
}

function computeHrvMetrics(rrData) {
  const rr = rrData.map((item) => item.rr);
  if (rr.length < 2) {
    return null;
  }

  const diffs = [];
  for (let index = 1; index < rr.length; index += 1) {
    diffs.push(rr[index] - rr[index - 1]);
  }

  const meanNN = average(rr);
  const meanHr = 60000 / meanNN;
  const sdnn = standardDeviation(rr);
  const rmssd = Math.sqrt(average(diffs.map((value) => value ** 2)));
  const pnn50 = (diffs.filter((value) => Math.abs(value) > 50).length / diffs.length) * 100;
  const sd1 = Math.sqrt(0.5) * standardDeviation(diffs);
  const sd2 = Math.sqrt(Math.max(0, 2 * sdnn ** 2 - 0.5 * standardDeviation(diffs) ** 2));
  const spectral = computeBandPowers(rrData);

  return {
    meanHr,
    meanNN,
    sdnn,
    rmssd,
    pnn50,
    lf: spectral.lf,
    hf: spectral.hf,
    lfHf: spectral.hf > 0 ? spectral.lf / spectral.hf : 0,
    sd1,
    sd2
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function computeBandPowers(rrData) {
  const psd = computePsdFromRr(rrData);
  let lf = 0;
  let hf = 0;

  psd.forEach((point, index) => {
    if (index === 0) {
      return;
    }
    const previous = psd[index - 1];
    const width = point.frequency - previous.frequency;
    const area = width * point.power;
    if (point.frequency >= 0.04 && point.frequency < 0.15) {
      lf += area;
    } else if (point.frequency >= 0.15 && point.frequency < 0.4) {
      hf += area;
    }
  });

  return { lf, hf };
}

function computePsdFromRr(rrData) {
  if (rrData.length < 4) {
    return [];
  }

  const rrSeconds = rrData.map((item) => item.rr / 1000);
  const rrTimes = [];
  let cumulative = 0;

  rrSeconds.forEach((value) => {
    cumulative += value;
    rrTimes.push(cumulative);
  });

  const interpolationRate = 4;
  const duration = rrTimes.at(-1);
  const resampled = [];

  for (let t = 0; t <= duration; t += 1 / interpolationRate) {
    resampled.push(linearInterpolate(rrTimes, rrSeconds, t) - average(rrSeconds));
  }

  const size = Math.min(512, nearestPowerOfTwo(resampled.length));
  if (size < 8 || resampled.length < size) {
    return [];
  }
  const trimmed = resampled.slice(0, size);
  const psd = [];

  for (let k = 1; k < size / 2; k += 1) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < size; n += 1) {
      const angle = (2 * Math.PI * k * n) / size;
      real += trimmed[n] * Math.cos(angle);
      imag -= trimmed[n] * Math.sin(angle);
    }
    const power = (real ** 2 + imag ** 2) / size;
    psd.push({
      frequency: (k * interpolationRate) / size,
      power
    });
  }

  return psd.filter((point) => point.frequency <= 0.5);
}

function nearestPowerOfTwo(length) {
  if (length < 8) {
    return 0;
  }
  let size = 1;
  while (size * 2 <= length) {
    size *= 2;
  }
  return size;
}

function linearInterpolate(xs, ys, target) {
  if (target <= xs[0]) {
    return ys[0];
  }
  if (target >= xs.at(-1)) {
    return ys.at(-1);
  }

  for (let index = 1; index < xs.length; index += 1) {
    if (xs[index] >= target) {
      const x0 = xs[index - 1];
      const x1 = xs[index];
      const y0 = ys[index - 1];
      const y1 = ys[index];
      const ratio = (target - x0) / (x1 - x0);
      return y0 + ratio * (y1 - y0);
    }
  }

  return ys.at(-1);
}

function assessSignalQuality() {
  if (state.peaks.length < 3) {
    return "Insufficient beats";
  }
  const rrValues = state.rr.map((entry) => entry.rr);
  const outlierRate = rrValues.filter((value) => value < 400 || value > 1400).length / rrValues.length;
  if (outlierRate > 0.15) {
    return "Potential artifact";
  }
  return "Usable rhythm window";
}

function renderRrTable() {
  const body = document.getElementById("rrTableBody");
  if (!state.rr.length) {
    body.innerHTML = `<tr><td colspan="3">No intervals available yet.</td></tr>`;
    return;
  }

  body.innerHTML = state.rr
    .slice(0, 40)
    .map(
      (entry) => `
        <tr>
          <td>${entry.beat}</td>
          <td class="mono">${entry.time.toFixed(3)}</td>
          <td class="mono">${entry.rr.toFixed(1)}</td>
        </tr>
      `
    )
    .join("");
}

function drawAllCharts() {
  drawSeriesChart(canvases.ecg, state.time, state.filteredSignal, {
    color: "#ab3c2e",
    title: "ECG",
    markers: state.peaks.map((index) => ({ x: state.time[index], y: state.filteredSignal[index] })),
    markerColor: "#16706d"
  });

  drawSeriesChart(
    canvases.rr,
    state.rr.map((entry) => entry.time),
    state.rr.map((entry) => entry.rr),
    { color: "#16706d", title: "RR (ms)" }
  );

  drawScatterChart(
    canvases.poincare,
    state.rr.slice(1).map((entry, index) => ({
      x: state.rr[index].rr,
      y: entry.rr
    })),
    "#c26a24"
  );

  drawSeriesChart(
    canvases.psd,
    state.psd.map((entry) => entry.frequency),
    state.psd.map((entry) => entry.power),
    {
      color: "#5d4ad8",
      title: "PSD",
      fill: "rgba(93, 74, 216, 0.16)",
      overlays: [
        { from: 0.04, to: 0.15, color: "rgba(171, 60, 46, 0.12)" },
        { from: 0.15, to: 0.4, color: "rgba(22, 112, 109, 0.12)" }
      ]
    }
  );
}

function drawSeriesChart(canvas, xs, ys, options = {}) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 20, right: 18, bottom: 34, left: 52 };
  context.clearRect(0, 0, width, height);

  if (!xs.length || !ys.length) {
    drawEmptyState(context, width, height);
    return;
  }

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  if (options.overlays) {
    options.overlays.forEach((overlay) => {
      const left = pad.left + ((overlay.from - xMin) / xSpan) * (width - pad.left - pad.right);
      const right = pad.left + ((overlay.to - xMin) / xSpan) * (width - pad.left - pad.right);
      context.fillStyle = overlay.color;
      context.fillRect(left, pad.top, right - left, height - pad.top - pad.bottom);
    });
  }

  drawAxes(context, width, height, pad);

  if (options.fill) {
    context.beginPath();
    context.moveTo(pad.left, height - pad.bottom);
    ys.forEach((y, index) => {
      const x = pad.left + ((xs[index] - xMin) / xSpan) * (width - pad.left - pad.right);
      const cy = height - pad.bottom - ((y - yMin) / ySpan) * (height - pad.top - pad.bottom);
      context.lineTo(x, cy);
    });
    context.lineTo(width - pad.right, height - pad.bottom);
    context.closePath();
    context.fillStyle = options.fill;
    context.fill();
  }

  context.beginPath();
  ys.forEach((y, index) => {
    const x = pad.left + ((xs[index] - xMin) / xSpan) * (width - pad.left - pad.right);
    const cy = height - pad.bottom - ((y - yMin) / ySpan) * (height - pad.top - pad.bottom);
    if (index === 0) {
      context.moveTo(x, cy);
    } else {
      context.lineTo(x, cy);
    }
  });
  context.lineWidth = 2;
  context.strokeStyle = options.color || "#ab3c2e";
  context.stroke();

  if (options.markers?.length) {
    context.fillStyle = options.markerColor || "#16706d";
    options.markers.forEach((marker) => {
      const x = pad.left + ((marker.x - xMin) / xSpan) * (width - pad.left - pad.right);
      const y = height - pad.bottom - ((marker.y - yMin) / ySpan) * (height - pad.top - pad.bottom);
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    });
  }

  drawAxisLabels(context, width, height, pad, xMin, xMax, yMin, yMax);
}

function drawScatterChart(canvas, points, color) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 20, right: 18, bottom: 34, left: 52 };
  context.clearRect(0, 0, width, height);

  if (!points.length) {
    drawEmptyState(context, width, height);
    return;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minValue = Math.min(...xs, ...ys);
  const maxValue = Math.max(...xs, ...ys);
  const span = maxValue - minValue || 1;

  drawAxes(context, width, height, pad);

  context.strokeStyle = "rgba(65, 45, 24, 0.2)";
  context.beginPath();
  context.moveTo(pad.left, height - pad.bottom);
  context.lineTo(width - pad.right, pad.top);
  context.stroke();

  context.fillStyle = color;
  points.forEach((point) => {
    const x = pad.left + ((point.x - minValue) / span) * (width - pad.left - pad.right);
    const y = height - pad.bottom - ((point.y - minValue) / span) * (height - pad.top - pad.bottom);
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
  });

  drawAxisLabels(context, width, height, pad, minValue, maxValue, minValue, maxValue);
}

function drawAxes(context, width, height, pad) {
  context.strokeStyle = "rgba(65, 45, 24, 0.22)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(pad.left, pad.top);
  context.lineTo(pad.left, height - pad.bottom);
  context.lineTo(width - pad.right, height - pad.bottom);
  context.stroke();
}

function drawAxisLabels(context, width, height, pad, xMin, xMax, yMin, yMax) {
  context.fillStyle = "#6d6257";
  context.font = '12px Consolas, "Courier New", monospace';
  context.fillText(xMin.toFixed(2), pad.left, height - 10);
  context.fillText(xMax.toFixed(2), width - pad.right - 38, height - 10);
  context.fillText(yMax.toFixed(2), 8, pad.top + 6);
  context.fillText(yMin.toFixed(2), 8, height - pad.bottom);
}

function drawEmptyState(context, width, height) {
  context.fillStyle = "rgba(109, 98, 87, 0.9)";
  context.font = '16px Aptos, "Trebuchet MS", "Segoe UI", sans-serif';
  context.textAlign = "center";
  context.fillText("No data to display yet", width / 2, height / 2);
  context.textAlign = "left";
}

renderMetrics();
setStatus();
drawAllCharts();
