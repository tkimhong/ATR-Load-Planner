const ADULT_KG = 185 * 0.453592;
const CHILD_KG = 35;
const ZONE_RATIO = { A: 0.27, B: 0.44, C: 0.29 };

const COMPS = [
  { name: "Fwd Right", max: 288 },
  { name: "Fwd Left", max: 448 },
  { name: "Rear Fwd R", max: 302 },
  { name: "Rear Aft R", max: 466 },
];

const LEMAC = 13.604;
const MAC = 2.303;

const ARM = {
  OEW: 13.7,
  ZONE_A: 13.1,
  ZONE_B: 15.35,
  ZONE_C: 17.5,
  FWD_COMPT: 9.2,
  AFT_COMPT: 19.8,
};

const OEW_KG = 13189;

const CG_MIN = 20.0;
const CG_MAX = 25.0;
const MAX_ATTEMPTS = 50;

const $ = (id) => document.getElementById(id);

let ofpData = null;
let lastDist = null;

function parseOFP() {
  const text = $("ofpText").value;
  if (!text.trim()) {
    showStatus("Paste the OFP first", "bad");
    return;
  }

  $("flightCard").hidden = true;
  $("efbCard").hidden = true;

  try {
    const header = text.match(
      /([A-Z]{2,3}\d+)\s+\d{2}[A-Z]{3}\d{4}\s+([A-Z]{4})-([A-Z]{4})/,
    );
    const reg = text.match(/\b([A-Z0-9]{1,2}-[A-Z]{3,4})\b/);
    const atc = text.match(/ATC C\/S\s+([A-Z0-9]+)/);
    const block = text.match(/BLOCK FUEL\s+\w+\s+(\d+)/);
    const trip = text.match(/^TRIP\s+\w+\s+(\d+)/m);
    const pax = text.match(/^PAX\s+(\d+)/m);
    const bag = text.match(/^BAG\/CARGO\s+(\d+)/m);

    const paxCount = parseInt(pax?.[1] || 0, 10);
    const blockFuel = parseInt(block?.[1] || 0, 10);

    if (!paxCount) throw new Error("No PAX count in the OFP");
    if (!blockFuel) throw new Error("No block fuel in the OFP");

    ofpData = {
      flightNumber: header?.[1] || "",
      origin: header?.[2] || "",
      dest: header?.[3] || "",
      aircraft: reg?.[1] || "",
      atcCallsign: atc?.[1] || "",
      paxCount,
      bagCargo: parseInt(bag?.[1] || 0, 10),
      blockFuel,
      tripFuel: parseInt(trip?.[1] || 0, 10),
    };

    showStatus("Parsed", "ok");
    renderFlight();
    renderEFB();
  } catch (e) {
    showStatus(e.message || "Could not read the OFP", "bad");
  }
}

function renderFlight() {
  const d = ofpData;
  const items = [
    d.flightNumber,
    d.atcCallsign,
    `${d.origin} -> ${d.dest}`,
    d.aircraft,
    `${d.paxCount} PAX`,
    `${d.blockFuel} kg`,
  ];
  $("flightStrip").innerHTML = items
    .filter(Boolean)
    .map((t) => `<span>${t}</span>`)
    .join("");
  $("flightCard").hidden = false;
}

function calcCG(dist) {
  const { zones, cargo } = dist;

  const paxA = zones.A.adults * ADULT_KG + zones.A.children * CHILD_KG;
  const paxB = zones.B.adults * ADULT_KG;
  const paxC = zones.C.adults * ADULT_KG;

  const fwd = cargo[0] + cargo[1];
  const aft = cargo[2] + cargo[3];

  const total = OEW_KG + paxA + paxB + paxC + fwd + aft;

  const moment =
    OEW_KG * ARM.OEW +
    paxA * ARM.ZONE_A +
    paxB * ARM.ZONE_B +
    paxC * ARM.ZONE_C +
    fwd * ARM.FWD_COMPT +
    aft * ARM.AFT_COMPT;

  const pct = ((moment / total - LEMAC) / MAC) * 100;

  return { pctMAC: Math.round(pct * 10) / 10, arm: moment / total, total };
}

function macToTrim(pctMAC) {
  const raw = 2.5 - (pctMAC - 15) * (2.5 / 20);
  const clamped = Math.max(0, Math.min(2.5, raw));
  return Math.round(clamped * 4) / 4;
}

function distribute() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const dist = tryDistribute();
    const cg = calcCG(dist);
    if (cg.pctMAC >= CG_MIN && cg.pctMAC <= CG_MAX) {
      dist.cg = cg;
      return dist;
    }
  }
  const dist = tryDistribute();
  dist.cg = calcCG(dist);
  return dist;
}

function tryDistribute() {
  const d = ofpData;
  const totalPax = d.paxCount;

  const maxChildren = Math.min(5, totalPax);
  const children =
    Math.random() < 0.4 ? Math.floor(Math.random() * maxChildren) + 1 : 0;

  let zA = Math.round(totalPax * ZONE_RATIO.A);
  let zB = Math.round(totalPax * ZONE_RATIO.B);

  zA = jitter(zA, 2, 1);
  zB = jitter(zB, 2, 1);
  let zC = totalPax - zA - zB;
  if (zC < 0) {
    zB += zC;
    zC = 0;
  }

  const childrenInA = Math.min(children, zA);

  const totalHold = estimateHoldWeight(totalPax);
  const fwdFrac = rand(0.43, 0.58);
  const totalFwd = clampRound(totalHold * fwdFrac, 10);
  const totalAft = totalHold - totalFwd;

  const fwdRight = Math.min(
    clampRound(totalFwd * rand(0.35, 0.55), 10),
    COMPS[0].max,
  );
  const fwdLeft = Math.min(clampRound(totalFwd - fwdRight, 10), COMPS[1].max);
  const rearFwd = Math.min(
    clampRound(totalAft * rand(0.3, 0.55), 10),
    COMPS[2].max,
  );
  const rearAft = Math.min(clampRound(totalAft - rearFwd, 10), COMPS[3].max);

  return {
    zones: {
      A: { adults: zA - childrenInA, children: childrenInA },
      B: { adults: zB, children: 0 },
      C: { adults: zC, children: 0 },
    },
    cargo: [fwdRight, fwdLeft, rearFwd, rearAft],
    fuel: { block: d.blockFuel, trip: d.tripFuel },
  };
}

function estimateHoldWeight(totalPax) {
  return Math.min(Math.max(Math.round(totalPax * 12), 400), 820);
}

function jitter(val, range, min) {
  return Math.max(
    min,
    val + Math.floor(Math.random() * (range * 2 + 1)) - range,
  );
}

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function clampRound(val, step) {
  return Math.round(val / step) * step;
}

function renderEFB() {
  lastDist = distribute();
  const { zones, cargo, fuel, cg } = lastDist;

  const inLimits = cg.pctMAC >= CG_MIN && cg.pctMAC <= CG_MAX;
  const trim = macToTrim(cg.pctMAC);

  $("cgPercent").textContent = cg.pctMAC.toFixed(1) + "% MAC";
  $("cgPercent").className = inLimits ? "ok" : "bad";
  $("cgTrim").textContent = trim === 0 ? "UP" : trim.toFixed(2);
  $("cgStatus").textContent = inLimits ? "in limits" : "out of limits";
  $("cgStatus").className = inLimits ? "ok" : "bad";
  $("cgSummary").textContent = `${cg.pctMAC.toFixed(1)}% MAC, ${
    inLimits ? "in limits" : "out of limits"
  }`;

  const span = 20;
  const pos = (pct) =>
    Math.round(Math.min(100, Math.max(0, ((pct - 15) / span) * 100)) * 10) /
      10 +
    "%";

  $("macOk").style.left = pos(CG_MIN);
  $("macOk").style.width =
    Math.round(((CG_MAX - CG_MIN) / span) * 1000) / 10 + "%";
  $("macPointer").style.left = pos(cg.pctMAC);
  $("macPointer").style.background = inLimits ? "#070" : "#c00";

  const rows = [
    head("Fuel"),
    row("Ramp fuel", fuel.block + " kg"),
    row("Trip fuel", fuel.trip + " kg"),

    head("Zone A, rows 1-5"),
    row("Adults", zones.A.adults),
    row("Children", zones.A.children),

    head("Zone B, rows 6-12"),
    row("Adults", zones.B.adults),
    row("Children", zones.B.children),

    head("Zone C, rows 14-20"),
    row("Adults", zones.C.adults),
    row("Children", zones.C.children),

    head("Cargo"),
    ...COMPS.map((c, i) =>
      row(`${c.name} (max ${c.max})`, cargo[i] + " kg", cargo[i] > c.max),
    ),
  ].join("");

  $("efbRows").innerHTML = rows;
  $("efbCard").hidden = false;
}

function head(text) {
  return `<tr class="head"><td colspan="2">${text}</td></tr>`;
}

function row(label, value, bad) {
  return `<tr><td>${label}</td><td class="${bad ? "bad" : ""}">${value}</td></tr>`;
}

function regenerate() {
  if (ofpData) renderEFB();
}

function copyAll() {
  if (!lastDist) return;
  const { zones, cargo, fuel, cg } = lastDist;
  const trim = macToTrim(cg.pctMAC);
  const text = [
    `RAMP FUEL: ${fuel.block} kg`,
    `TRIP FUEL: ${fuel.trip} kg`,
    "",
    `ZONE A - Adults: ${zones.A.adults}  Children: ${zones.A.children}`,
    `ZONE B - Adults: ${zones.B.adults}  Children: ${zones.B.children}`,
    `ZONE C - Adults: ${zones.C.adults}  Children: ${zones.C.children}`,
    "",
    ...COMPS.map((c, i) => `${c.name}: ${cargo[i]} kg`),
    "",
    `CG: ${cg.pctMAC.toFixed(1)}% MAC`,
    `PITCH TRIM: ${trim === 0 ? "UP" : trim.toFixed(2)}`,
  ].join("\n");

  try {
    navigator.clipboard.writeText(text).then(
      () => showStatus("Copied", "ok"),
      () => showStatus("Copy failed", "bad"),
    );
  } catch {
    showStatus("Copy failed", "bad");
  }
}

function showStatus(msg, type) {
  const box = $("statusBox");
  box.hidden = false;
  box.textContent = msg;
  box.className = "status " + type;
}
