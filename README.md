# ATR Load Planner

Load planner for VA flights in the MSFS Asobo ATR 72-600. With a SimBrief OFP it works out how to split the passengers and cargo so the CG lands inside the EFB's envelope, then gives you the figures to type into the load sheet.

Just a temporary solution for automating the load instructions.

Live at [tkimhong.github.io/ATR-Load-Planner](https://tkimhong.github.io/ATR-Load-Planner/).

## How to use

1. Enter your SimBrief user ID and press **Generate load** (it is remembered after the first time).
2. Fill the load sheet with the numbers it gives you: ramp and trip fuel, the Zone A/B/C passenger counts and the four cargo compartment weights.
3. Check the CG it shows against what the EFB says. They should agree to ~0.1% MAC.

**Regenerate** gives a different valid split from the same OFP without fetching again. The last OFP is remembered, so you can close the tab and come back to it.

**Or paste an OFP** takes the full SimBrief OFP text instead, for archived flights or when simbrief.com is unreachable.

## Calculations

Standard weight and balance: mass * arm, summed, divided by total mass. The pitch trim is read off a line fitted to the EFB's own readings.

The zone split roughly follows the real 72-seat cabin (18 / 28 / 26). The cargo split is then solved so the aircraft ends up mid-envelope rather than guessed at, and passengers move between zone B and C if the holds run out of room.

With a different aircraft the arms need re-measuring; these are available in the aircraft's weight and balance manual.

## Limits

- Right now the tool targets a specific VA EFB where the envelope is 20–31% MAC.
- It needs simbrief.com to be up for the fetch; the paste box is the fallback.
- The EFB's empty weight is 14,000 kg against SimBrief's 13,340, so its ZFW and TOW read ~665 kg above the OFP (the weight row shows both).
