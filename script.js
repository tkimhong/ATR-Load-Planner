const ADULT_KG = 84;
const CHILD_KG = 35;
const ZONE_RATIO = { A: 0.25, B: 0.39, C: 0.36 };
const SEATS = { A: 18, B: 28, C: 26 };

const COMPS = [
  { name: "Fwd Right", max: 288, arm: 6.662 },
  { name: "Fwd Left", max: 448, arm: 6.662 },
  { name: "Rear Fwd R", max: 302, arm: 23.181 },
  { name: "Rear Aft R", max: 466, arm: 24.318 },
];

const LEMAC = 13.604;
const MAC = 2.303;

const ARM = {
  OEW: 14.237,
  ZONE_A: 8.95,
  ZONE_B: 13.821,
  ZONE_C: 19.153,
  FUEL: 14.516,
};

const OEW_KG = 14000;

const CG_MIN = 20.0;
const CG_MAX = 31.0;
const TARGET_CG = 25.5;

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
  const { zones, cargo, fuel } = dist;

  const paxA = zones.A.adults * ADULT_KG + zones.A.children * CHILD_KG;
  const paxB = zones.B.adults * ADULT_KG;
  const paxC = zones.C.adults * ADULT_KG;

  const ramp = Math.max(0, fuel.block - 50);

  const total =
    OEW_KG +
    paxA +
    paxB +
    paxC +
    ramp +
    cargo.reduce((sum, kg) => sum + kg, 0);

  const moment =
    OEW_KG * ARM.OEW +
    paxA * ARM.ZONE_A +
    paxB * ARM.ZONE_B +
    paxC * ARM.ZONE_C +
    ramp * ARM.FUEL +
    cargo.reduce((sum, kg, i) => sum + kg * COMPS[i].arm, 0);

  const pct = ((moment / total - LEMAC) / MAC) * 100;

  return { pctMAC: Math.round(pct * 10) / 10, arm: moment / total, total };
}

function macToTrim(pctMAC) {
  return Math.round((4.0133 - 0.10835 * pctMAC) * 100) / 100;
}

function distribute() {
  let zones = splitZones(ofpData.paxCount);
  let best = null;

  for (let i = 0; i < 40; i++) {
    const dist = {
      zones,
      cargo: solveCargo(zones),
      fuel: { block: ofpData.blockFuel, trip: ofpData.tripFuel },
    };
    const cg = calcCG(dist);
    dist.cg = cg;

    if (cg.pctMAC >= CG_MIN && cg.pctMAC <= CG_MAX) return dist;
    if (
      !best ||
      Math.abs(cg.pctMAC - TARGET_CG) < Math.abs(best.cg.pctMAC - TARGET_CG)
    ) {
      best = dist;
    }

    zones = shift(zones, cg.pctMAC > TARGET_CG);
    if (!zones) return best;
  }

  return best;
}

function splitZones(n) {
  const a = Math.min(SEATS.A, Math.round(n * ZONE_RATIO.A));
  let b = Math.min(SEATS.B, Math.round(n * ZONE_RATIO.B));
  let c = Math.max(0, Math.min(SEATS.C, n - a - b));

  const up = Math.min(c, SEATS.B - b);
  const down = Math.min(b, SEATS.C - c);
  const step = Math.max(-down, Math.min(up, Math.floor(Math.random() * 5) - 2));
  b += step;
  c -= step;

  const children =
    a > 0 && Math.random() < 0.4
      ? 1 + Math.floor(Math.random() * Math.min(5, a))
      : 0;

  return {
    A: { adults: Math.max(0, a - children), children: Math.min(children, a) },
    B: { adults: b, children: 0 },
    C: { adults: c, children: 0 },
  };
}

function estimateHoldWeight(totalPax) {
  return Math.min(Math.max(Math.round(totalPax * 12), 400), 820);
}

function solveCargo(zones) {
  const hold = estimateHoldWeight(ofpData.paxCount);
  const fuel = Math.max(0, ofpData.blockFuel - 50);

  const paxA = zones.A.adults * ADULT_KG + zones.A.children * CHILD_KG;
  const paxB = zones.B.adults * ADULT_KG;
  const paxC = zones.C.adults * ADULT_KG;

  const weight = OEW_KG + paxA + paxB + paxC + fuel;
  const moment =
    OEW_KG * ARM.OEW +
    paxA * ARM.ZONE_A +
    paxB * ARM.ZONE_B +
    paxC * ARM.ZONE_C +
    fuel * ARM.FUEL;

  const target = LEMAC + (TARGET_CG / 100) * MAC;
  const need = target * (weight + hold) - moment;

  const fwdCap = COMPS[0].max + COMPS[1].max;
  const aftCap = COMPS[2].max + COMPS[3].max;
  const aftArm =
    (COMPS[2].max * COMPS[2].arm + COMPS[3].max * COMPS[3].arm) / aftCap;

  const wanted = (hold * aftArm - need) / (aftArm - COMPS[0].arm);
  const fwd = Math.round(Math.min(fwdCap, Math.max(0, wanted)) / 10) * 10;

  const fwdRight = Math.min(
    COMPS[0].max,
    Math.round(((fwd * COMPS[0].max) / fwdCap) / 10) * 10,
  );
  const fwdLeft = Math.min(COMPS[1].max, fwd - fwdRight);

  const aft = Math.min(aftCap, hold - fwd);
  const rearFwd = Math.min(
    COMPS[2].max,
    Math.round(((aft * COMPS[2].max) / aftCap) / 10) * 10,
  );
  const rearAft = Math.min(COMPS[3].max, aft - rearFwd);

  return [fwdRight, fwdLeft, rearFwd, rearAft];
}

function shift(zones, forward) {
  const z = { A: { ...zones.A }, B: { ...zones.B }, C: { ...zones.C } };
  const room = {
    A: SEATS.A - z.A.adults - z.A.children,
    B: SEATS.B - z.B.adults,
    C: SEATS.C - z.C.adults,
  };

  if (forward) {
    if (z.C.adults > 0 && room.B > 0) {
      z.C.adults--;
      z.B.adults++;
      return z;
    }
    if (z.B.adults > 0 && room.A > 0) {
      z.B.adults--;
      z.A.adults++;
      return z;
    }
    if (z.C.adults > 0 && room.A > 0) {
      z.C.adults--;
      z.A.adults++;
      return z;
    }
  } else {
    if (z.A.adults > 0 && room.B > 0) {
      z.A.adults--;
      z.B.adults++;
      return z;
    }
    if (z.B.adults > 0 && room.C > 0) {
      z.B.adults--;
      z.C.adults++;
      return z;
    }
    if (z.A.adults > 0 && room.C > 0) {
      z.A.adults--;
      z.C.adults++;
      return z;
    }
  }

  return null;
}

function renderEFB() {
  lastDist = distribute();
  const { zones, cargo, fuel, cg } = lastDist;

  const inLimits = cg.pctMAC >= CG_MIN && cg.pctMAC <= CG_MAX;
  const trim = macToTrim(cg.pctMAC);

  $("cgPercent").textContent = cg.pctMAC.toFixed(1) + "% MAC";
  $("cgPercent").className = inLimits ? "ok" : "bad";
  $("cgTrim").textContent = trim.toFixed(2);
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
    `PITCH TRIM: ${trim.toFixed(2)}`,
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
