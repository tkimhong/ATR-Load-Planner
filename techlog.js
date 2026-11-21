const COLS = [
  ["pilot", "PILOT"],
  ["date", "DATE"],
  ["flight", "FLIGHT"],
  ["type", "TYPE"],
  ["dep", "DEP"],
  ["off", "BLK OFF"],
  ["to", "TO"],
  ["arr", "ARR"],
  ["ldg", "LDG"],
  ["on", "BLK ON"],
  ["blk", "BLK"],
  ["air", "FLIGHT"],
  ["cycles", "CYCLES"],
  ["uplift", "FUEL UPLIFT"],
  ["fuelDep", "FUEL DEP"],
  ["fuelArr", "FUEL ARR"],
  ["fuelUsed", "FUEL USED"],
];

const $ = (id) => document.getElementById(id);

let ofp = null;
let inputs = {};

function saveState() {
  try {
    localStorage.setItem(
      "techlog",
      JSON.stringify({
        pirep: $("pirep").value,
        prev: $("prevArr").value,
        ofp,
      }),
    );
  } catch {}
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("techlog") || "null");
    if (!saved) return false;

    if (saved.pirep) $("pirep").value = saved.pirep;
    if (saved.prev) $("prevArr").value = saved.prev;
    if (saved.ofp) ofp = saved.ofp;

    return !!saved.pirep;
  } catch {
    return false;
  }
}

function clearAll() {
  try {
    localStorage.removeItem("techlog");
  } catch {}

  $("pirep").value = "";
  $("prevArr").value = "";
  $("rowCard").hidden = true;
  $("preview").textContent = "";
  $("note").textContent = "";
  $("prevValue").textContent = "";
  ofp = null;
  inputs = {};
  setStatus("");
}

function setStatus(msg, tone) {
  const el = $("status");
  el.hidden = !msg;
  el.textContent = msg || "";
  el.className = "status" + (tone ? " " + tone : "");
}

async function fetchOFP(skipBuild) {
  const id = $("simbriefId").value.trim();
  if (!id) return setStatus("Enter your SimBrief user ID", "bad");

  try {
    localStorage.setItem("simbriefId", id);
  } catch {}

  setStatus("Fetching");

  try {
    const res = await fetch(
      `https://www.simbrief.com/api/xml.fetcher.php?userid=${encodeURIComponent(id)}&json=1`,
      { cache: "no-store" },
    );
    const data = await res.json();

    if (!res.ok || data.fetch?.status !== "Success") {
      throw new Error("No OFP found for that user ID");
    }

    ofp = {
      dep: data.origin?.icao_code || "",
      arr: data.destination?.icao_code || "",
      ramp: Number(data.fuel?.plan_ramp || 0),
      reg: data.aircraft?.reg || "",
      callsign: data.atc?.callsign || "",
    };

    setStatus(
      `OFP ${ofp.reg} ${ofp.dep}-${ofp.arr}, ${ofp.ramp} kg ramp`,
      "ok",
    );
    if (!skipBuild && $("pirep").value.trim()) build();
  } catch (e) {
    setStatus(e.message || "Could not reach SimBrief", "bad");
  }
}

function fuelBlock(text) {
  const start = text.indexOf("Fuel (kg)");
  if (start < 0) return null;

  const actual = text.indexOf("Actual", start);
  if (actual < 0) return null;

  const nums = (text.slice(actual).match(/\d[\d,]*/g) || [])
    .slice(0, 5)
    .map((n) => Number(n.replace(/,/g, "")));

  if (nums.length < 4) return null;
  return {
    ramp: nums[0],
    takeoff: nums[1],
    used: nums[2],
    landing: nums[3],
  };
}

function parsePIREP(text) {
  const pick = (re) => (text.match(re) || [])[1] || "";

  return {
    flight: pick(/Flight Number\s*([A-Z]{2,3}\d+)/),
    callsign: pick(/Callsign\s+([A-Z0-9]+)/),
    type: pick(/Type\s+(Scheduled|Repositioning)/i),
    reg: pick(/Aircraft\s+([A-Z0-9]{1,2}-[A-Z0-9]{3,4})/),
    date: pick(/Tracking Started\s+([A-Z][a-z]{2} \d{1,2}, \d{4})/),
    off: pick(/Off Blocks\s+(\d{1,2}:\d{2})/),
    to: pick(/Takeoff\s+(\d{1,2}:\d{2})/),
    ldg: pick(/Landing\s+(\d{1,2}:\d{2})/),
    on: pick(/On Blocks\s+(\d{1,2}:\d{2})/),
    blk: pick(/Block Time\s+(\d{1,2}:\d{2}:\d{2})/),
    air: pick(/Airborne\s+(\d{1,2}:\d{2}:\d{2})/),
    fuel: fuelBlock(text),
  };
}

function hhmm(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return h.padStart(2, "0") + m;
}

function hmm(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}:${m}`;
}

function ddmmyyyy(s) {
  const d = new Date(s);
  if (!s || Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function round10(n) {
  return Math.round(n / 10) * 10;
}

function parsePrev(value) {
  const tokens = (value || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  const raw = tokens.length >= 17 ? tokens[15] : tokens[0];
  return Number(raw.replace(/,/g, "")) || 0;
}

function updatePrev() {
  const raw = $("prevArr").value.trim();
  const value = parsePrev(raw);
  const el = $("prevValue");

  if (!value) {
    el.textContent = "";
    return;
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  el.textContent =
    tokens.length >= 17
      ? `using ${value} from the pasted row`
      : `using ${value}`;
}

function applyPrev() {
  const prev = parsePrev($("prevArr").value);
  if (!prev || !inputs.fuelDep) return;

  const dep = Number(inputs.fuelDep.value) || 0;
  if (dep) inputs.uplift.value = String(Math.max(0, dep - prev));
}

async function build() {
  const text = $("pirep").value;
  if (!text.trim()) return setStatus("Paste the PIREP block first", "bad");

  if (!ofp && $("simbriefId").value.trim()) await fetchOFP(true);

  const p = parsePIREP(text);
  const fuel = p.fuel || {};

  const pilot = $("pilotId").value.trim().toUpperCase();
  try {
    localStorage.setItem("pilotId", pilot);
  } catch {}

  const fuelDep = round10(fuel.ramp || ofp?.ramp || 0);
  const fuelArr = round10(fuel.landing || 0);
  const prev = parsePrev($("prevArr").value);
  const uplift = prev ? Math.max(0, fuelDep - prev) : 0;

  const values = {
    pilot,
    date: ddmmyyyy(p.date) || ddmmyyyy(new Date()),
    flight: (p.flight.match(/\d+/) || [""])[0],
    type: p.type ? p.type[0].toUpperCase() : "",
    dep: ofp?.dep || "",
    off: hhmm(p.off),
    to: hhmm(p.to),
    arr: ofp?.arr || "",
    ldg: hhmm(p.ldg),
    on: hhmm(p.on),
    blk: hmm(p.blk),
    air: hmm(p.air),
    cycles: "1",
    uplift: uplift ? String(uplift) : "",
    fuelDep: fuelDep ? String(fuelDep) : "",
    fuelArr: fuelArr ? String(fuelArr) : "",
    fuelUsed: fuelDep && fuelArr ? String(fuelDep - fuelArr) : "",
  };

  const callsign = p.callsign || ofp?.callsign || "";
  $("operator").textContent = (callsign.match(/^[A-Z]{2,3}/) || [""])[0];
  $("reg").textContent = p.reg || ofp?.reg || "";
  updatePrev();

  renderFields(values);
  $("rowCard").hidden = false;
  updatePreview();
  saveState();

  const missing = COLS.filter(
    ([key]) => key !== "uplift" && !inputs[key].value,
  ).map(([, label]) => label);

  if (missing.length) {
    setStatus(`Missing: ${missing.join(", ")}`, "bad");
  } else {
    setStatus("Row ready, add FUEL UPLIFT", "warn");
  }
}

function renderFields(values) {
  $("fields").innerHTML = COLS.map(
    ([key, label]) =>
      `<tr><td>${label}</td><td><input id="f_${key}" data-key="${key}"></td></tr>`,
  ).join("");

  inputs = {};
  for (const [key] of COLS) {
    const el = $(`f_${key}`);
    el.value = values[key] ?? "";
    inputs[key] = el;
  }
}

function syncFuelUsed() {
  const dep = Number(inputs.fuelDep.value) || 0;
  const arr = Number(inputs.fuelArr.value) || 0;
  if (dep && arr) inputs.fuelUsed.value = String(dep - arr);
}

function updateNote() {
  const dep = Number(inputs.fuelDep?.value) || 0;
  const arr = Number(inputs.fuelArr?.value) || 0;
  const used = Number(inputs.fuelUsed?.value) || 0;
  const note = $("note");

  if (dep && arr && used && used !== dep - arr) {
    note.textContent = `FUEL USED is ${used}, but ${dep} - ${arr} is ${dep - arr}`;
  } else {
    note.textContent = "";
  }
}

function handleFieldInput(key) {
  if (key === "fuelDep") applyPrev();
  if (key === "fuelDep" || key === "fuelArr") syncFuelUsed();

  updatePreview();
  updateNote();
}

function readRow() {
  return COLS.map(([key]) => inputs[key]?.value.trim() ?? "");
}

function updatePreview() {
  $("preview").textContent = readRow().join("\t");
}

function copyRow() {
  if (!Object.keys(inputs).length) return;

  const text = readRow().join("\t");

  try {
    navigator.clipboard.writeText(text).then(
      () => flashButton("Copied"),
      () => flashButton("Copy failed"),
    );
  } catch {
    flashButton("Copy failed");
  }
}

let flashTimer;
function flashButton(label) {
  const btn = $("copyBtn");
  clearTimeout(flashTimer);
  btn.textContent = label;
  flashTimer = setTimeout(() => {
    btn.textContent = "Copy row";
  }, 1500);
}

$("fields").addEventListener("input", (e) =>
  handleFieldInput(e.target.dataset.key),
);

$("prevArr").addEventListener("input", () => {
  if (!inputs.fuelDep) return;
  applyPrev();
  updatePrev();
  updatePreview();
  updateNote();
});

let saveTimer;
$("pirep").addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
});

try {
  const saved = localStorage.getItem("simbriefId");
  if (saved) $("simbriefId").value = saved;

  const pilot = localStorage.getItem("pilotId");
  if (pilot) $("pilotId").value = pilot;
} catch {}

if (loadState()) build();
