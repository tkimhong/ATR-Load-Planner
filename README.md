# ATR tools

Two static tools for VA flying in the MSFS Asobo ATR 72-600: a load planner and a
tech log.

Live at [tkimhong.github.io/ATR-Load-Planner](https://tkimhong.github.io/ATR-Load-Planner/).

## Load planner

`index.html` with a SimBrief OFP it works out how to split the passengers and
cargo so the CG lands inside the EFB's envelope, then gives you the figures to
type into the load sheet. A temporary replacement for the hand-made OCC load
instruction.

<img width="449" height="906" alt="The load planner with a generated load" src="https://github.com/user-attachments/assets/13463a88-bdba-4ec0-a5b0-56fa583e661f" />

1. Enter your SimBrief user ID and press **Generate load** (it is remembered after the first time).
2. Fill the load sheet with the numbers it gives you: ramp and trip fuel, the Zone A/B/C passenger counts and the four cargo compartment weights.
3. Check the CG it shows against what the EFB says. They should agree to ~0.1% MAC.

**Regenerate** gives a different valid split from the same OFP without fetching again. The last OFP is remembered, so you can close the tab and come back to it.

**Or paste an OFP** takes the full SimBrief OFP text instead, for archived flights or when simbrief.com is unreachable.

Standard weight and balance: mass * arm, summed, divided by total mass. The pitch
trim is read off a line fitted to the EFB's own readings. The zone split follows
the real 72-seat cabin (18 / 28 / 26); the cargo split is solved so the aircraft
ends up mid-envelope rather than guessed at.

## Tech log

`techlog.html` is for post-flight. Paste the PIREP's flight-data block, fetch the OFP,
and the one tab-separated row is ready to be copied.

- **From the PIREP**: flight number, date, type, the four times, block and flight
  time, and the actual fuel figures
- **From the OFP**: departure and arrival, and the planned ramp fuel
- **Derived**: `FUEL USED = DEP − ARR`, and `FUEL UPLIFT = DEP − previous landing`
- The operator code and registration are shown at the top, so you know which
  aircraft's sheet you are filling
- The row survives a refresh; **Clear** starts a new day
- Works for either type in the fleet - it only reads the PIREP and your sheet columns

## Limits

- The load planner targets the VA EFB, not the sim: its envelope is 20-31% MAC.
- Both need simbrief.com up. The planner has a paste fallback; the tech log does not.
- The EFB's empty weight is 14,000 kg against SimBrief's 13,340, so its ZFW and
  TOW read ~665 kg above the OFP (the weight row shows both).
