# Astrologiprogrammet

A private Windows desktop program for Hellenistic astrology, built with Tauri 2.
It is installed on one user's PC and updates itself from GitHub Releases.

## Source of truth

The requirements are in `docs/` (private, git-ignored, only on the development PC):

- `docs/kravspecifikation_v0.1.txt` — the specification (Danish). Plain-text copy of the `.docx` beside it.
- `docs/lots_formler_kildetillaeg.txt` — exact formulas for the seven Hermetic lots.
- `docs/planetary_condition_kvalitetssikring.txt` — Planetary Condition decisions of 14 November 2026 (Danish). Supplements the specification and overrides it where they differ (notably: overcoming is a right-hand whole-sign sextile, square or trine, not only the square). Its section 6 lists what is still undecided and must not be guessed.
- `docs/planetary_condition_beslutningstillaeg.txt` — final decision supplement of the same date. Overrides the document above where they differ; its section 3 lists what is still not to be guessed.
- `docs/plan.md` — the approved build plan with phases and the open questions tied to each.

Rules that follow from the specification:

- **Do not invent astrological rules.** Where the spec marks something open (ÅBENT) or says a detail is not decided, either make it a user-adjustable setting with a clearly stated default, or stop and ask. Say which you did.
- Rejected features stay out: daily profections, hayz, point scores, transit→progression aspects, autoplay. PDF reports and the dedicated transit biwheel design are deferred.
- The interface is in Danish, keeping the English technical terms the spec uses (Planetary Condition, Live Chart, Time Lord, Solar Return, lots).

## Status

| Phase | Content | State |
|---|---|---|
| 0 | Scaffold, self-update pipeline | Done, update verified on the user's PC |
| 1 | Calculation core: positions, angles, whole-sign houses, sect, time zones | Done (v0.0.2) |
| 2 | Natal chart: birth form, place search, archive, wheel, aspects, settings, start screen | Done (v0.1.0) |
| 3 | Seven Hermetic lots: overview, lot aspects, wheel, manual sect per chart | Done (v0.2.0). Proposed defaults awaiting feedback: "e" = orb under 1° (setting), lot aspects to planets only (angles and other lots are switches), placeholder symbols (two letters in a circle) |
| 4 | Profections | **Next** |
| 5 | Transits, Live Chart, life events | Not started |
| 6 | Planetary Condition | Category rules supplied for dignities, Sun conditions, houses, co-presence, domicile lord, reception, overcoming, engagement, adherence, chariot, maltreatment by striking with a ray; sect never changes a colour; counteraction rejected. Still blocked: enclosure intervention algorithm, bonification/maltreatment sub-forms not spelled out, Mercury and joy geometry, modern planets (full list in `docs/plan.md`, Phase 6) |
| 7 | Secondary progressions, rectification | Blocked: Naibod in longitude or right ascension |
| 8 | Solar Return | Blocked: algorithm and default location |
| 9 | Synodic cycles, event search, reports | Reports need a description first |

## Layout

```
crates/astro-core/   Pure Rust: all astronomy and astrological rules. No Tauri, no UI.
  src/ephemeris.rs   Safe wrapper over vendored Swiss Ephemeris 2.10.03 (vendor/swisseph, built by build.rs)
  src/chart.rs       compute_chart: positions, angles, houses, sect
  src/aspects.rs     find_aspects: orb, applying/separating, out-of-sign
  src/lots.rs        the seven Hermetic lots, lot overview facts, lot aspects (lot_report)
  src/time.rs        local birth time → UTC (tzdb, includes pre-1970 "backzone" history)
  src/places.rs      offline place search over resources/places.tsv
  src/zodiac.rs      Sign, Body, ZodiacPoint, whole_sign_house
src-tauri/           App shell: commands (src/lib.rs), SQLite storage (src/db.rs), updater
src/                 React + TypeScript interface. Draws only; no astrological logic here.
  api.ts             Every backend call. astro.ts: types and Danish names. settings.tsx: remembered settings.
  components/        ChartWheel (SVG), AspectTable, PositionsTable, LotsTable, LotAspectTable
  views/             StartView, ArchiveView, ChartView, ChartForm, SettingsView
  dev/               Stand-in backend + fixture for working on screens in a plain browser
resources/           ephe/*.se1 (1800–2399), places.tsv (GeoNames, built by scripts/build-places.mjs)
scripts/e2e-check.mjs  Drives the running app end to end
```

Conventions:

- New calculations go in `astro-core` with unit tests, are exposed through a command in `src-tauri/src/lib.rs`, typed in `src/astro.ts`, and called via `src/api.ts`. Add a matching case to `src/dev/mockBackend.ts`.
- Longitudes are tropical ecliptic degrees in [0, 360); use `normalize_degrees`. Display truncates to whole arc-minutes (`ZodiacPoint`), never rounds up.
- Database changes are appended to `MIGRATIONS` in `src-tauri/src/db.rs`. Never edit a migration that has shipped: the user's data file must survive every update.
- Anything the user can adjust is stored through `src/settings.tsx`; `mergeOver` fills in defaults for keys added later.
- Verify astronomy against something independent of Swiss Ephemeris where possible (see `tests/reference.rs`, which uses JPL Horizons values).

## Commands

Rust is installed but `cargo` is not on the default PATH of tool shells. In PowerShell prefix with
`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path";` and in Bash with `export PATH="$HOME/.cargo/bin:$PATH";`.

```
cargo test --workspace      # Rust tests (needs dist/ to exist: run pnpm build first)
pnpm test                   # interface tests (vitest)
pnpm build                  # type-check and build the interface
pnpm tauri dev              # run the real app
cargo run -p astro-core --example chart_json   # regenerate src/dev/fixture.json (write as UTF-8 without BOM)
```

Checking the interface:

- **Screens with stand-in data:** start the `interface` server from `.claude/launch.json` (port 1420) and look at it in the browser pane. Calculations are not real there; every chart is the fixture. Stop this server before `pnpm tauri dev`, which needs the same port.
- **Real app, end to end:** start with `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"; pnpm tauri dev`, wait for the window, then `node scripts/e2e-check.mjs`. Extend that script when adding commands.

## Releasing

Only release when asked. Installed copies pick up the newest release on next start.

1. Set the same version in `package.json` (`"version"`) and the root `Cargo.toml` (`[workspace.package]`), then `cargo update --workspace --offline` to refresh `Cargo.lock`.
2. Commit, `git tag vX.Y.Z`, `git push origin main vX.Y.Z`.
3. The `Release` workflow runs all tests, builds the NSIS installer, signs the update and publishes it. Watch it with `gh run watch <id> --exit-status` in the background.
4. Confirm `https://github.com/CurryDK/astrologiprogrammet/releases/latest/download/latest.json` shows the new version.

Notes:

- The update signing key is at `%USERPROFILE%\.tauri\astrologiprogrammet.key` (no password) and in the repository secret `TAURI_SIGNING_PRIVATE_KEY`. If the secret must be set again, use Bash (`gh secret set NAME < file`); piping through PowerShell adds a byte-order mark that breaks signing.
- The repository is public. Keep personal details out of tracked files, and keep `docs/` ignored. Commits use the GitHub no-reply address configured in this repository.
- The project is AGPL-3.0-or-later because Swiss Ephemeris requires it.
