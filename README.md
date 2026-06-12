# Manual Filament Shift

A client-only web tool that converts Bambu Studio and OrcaSlicer AMS tool
changes into manual filament-change pauses.

## Use

Open `index.html` in a modern browser, then drop in a `.gcode` file. The tool:

- detects the initial AMS load and mid-layer tool changes;
- lets you rename filament colors;
- shows each pause by layer, Z height, and estimated elapsed time;
- preserves the slicer's positioning and wipe-tower G-code;
- replaces AMS load/unload spans with `M400 U1` pauses;
- removes the end-of-print "pull back filament to AMS" sequence; and
- downloads a new G-code file without uploading anything.

For a local web-server URL instead of opening the file directly:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Test

```sh
node test.cjs
```

The test uses the included `Icemaker Vents - Part Plates_PLA_4h45m.gcode`
sample and verifies that three pauses are created and actionable AMS commands
are removed.

## Safety

Inspect the converted file in Bambu Studio or OrcaSlicer before printing.
Manual filament changes require an operator to unload, load, and confirm
filament flow before resuming.
