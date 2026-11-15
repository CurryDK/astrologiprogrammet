# Astrologiprogrammet

A private Windows desktop program for Hellenistic astrology, built with Tauri 2.
It is installed on one user's PC and updates itself from GitHub Releases.

## Source of truth

The requirements are in `docs/` (private, git-ignored, only on the development PC):

- `docs/kravspecifikation_v0.1.txt` — the specification (Danish). Plain-text copy of the `.docx` beside it.
- `docs/lots_formler_kildetillaeg.txt` — exact formulas for the seven Hermetic lots.
- `docs/planetary_condition_kvalitetssikring.txt` — Planetary Condition decisions of 14 November 2026 (Danish). Supplements the specification and overrides it where they differ (notably: overcoming is a right-hand whole-sign sextile, square or trine, not only the square). Its section 6 lists what is still undecided and must not be guessed.
- `docs/planetary_condition_beslutningstillaeg.txt` — final decision supplement of the same date. Overrides the document above where they differ; its section 3 lists what is still not to be guessed.
- `docs/planetary_condition_svar_11_spoergsmaal.txt` — answers of 15 November 2026 to the 11 remaining Planetary Condition questions (enclosure intervention, overcoming, opposition/trine, engagement, stations, Mercury, joys, modern planets, house 11, "Åbn alle/Luk alle"). Latest decision wins. Its point 3 leaves striking with a ray from Venus/Jupiter undecided: do not code it. Summarised in English at the end of `docs/plan.md`.
- `docs/planetary_condition_13_beslutninger.txt` — 13 implementation decisions of 15 November 2026, the newest Planetary Condition document; has priority on its 13 points (house 1 fortunate, Mercury's joy by solar phase, ratings for combust, beams, cazimi, detriment, fall and the joys, striking with a ray from Venus/Jupiter, Slow/Fast/Retro speed). Summarised at the end of `docs/plan.md`.
- `docs/beslutningstillaeg_seks_tekniske_afklaringer.txt` — six approved decisions of the same date: aspect colours and line-thickness formula, Naibod for progressed angles, Solar Return calculation and place, life events with missing date parts, sect on the horizon and manual override, lot display precision. Summarised in English at the end of `docs/plan.md`.
- `docs/beslutningstillaeg_progressioner_rektifikation.txt` — 15 approved decisions of 15 November 2026 on secondary progressions (1–10) and rectification (11–15). Its section C lists what is still open (the list of alternative angle methods; no uncertainty marking for the Moon with an unknown birth time). Summarised at the end of `docs/plan.md`.
- `docs/natalhjul_visuel_specifikation.txt` — visual specification of the natal wheel, 15 November 2026 (Danish; the `.docx` beside it has the reference pictures): element colours, degree scale, decan and bounds rings, upright planet labels with `Rx`, lot symbols, aspect line reference. Its ÅBENT/FORELØBIGT/KONTROL marks say what is still to be judged in the program. Summarised at the end of `docs/plan.md`.
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
| 4 | Profections: annual and monthly, Time Lord, overview, timeline, year navigation | Done (v0.3.0). Proposed defaults awaiting feedback (all settings): year starts on the calendar birthday at the birth clock time in the birthplace's time zone (alternatives: 00:00, or the Sun's exact return); 29 February births use 28 February in other years (alternative: 1 March); month dates shown with clock times, dates only when the birth time is unknown |
| 5 | Transits, Live Chart (natal + transit layers), life events, standalone transit chart | Done (v0.4.0). Proposed defaults awaiting feedback: transit orb 7° (setting); Time Lord filters add up and match a planet as transiting or natal, "planets in the profection sign" = natal planets in it plus transiting planets passing through it; times shown and entered in the computer's time zone, each life event stores that zone; a month step is a calendar month, day/week steps keep the clock time; no transiting ASC/MC; exact-pass search ends when the bodies are 25° apart and returns at most 9 passes; standalone transit chart seen from Copenhagen; transits drawn as a simple outer ring (biwheel design still deferred) |
| 6 | Planetary Condition | Done (v0.5.1, including the 13 decisions of 15 November 2026). Matrix and per-planet details for the seven traditional planets under the wheel; rules from the four Planetary Condition documents (latest wins); sect never changes a bonification/maltreatment rating; counteraction rejected. Neutral by decision: own decan, within 3° of an angle, one-sided reception, the bare overcoming relation. The supportive colour stays turquoise (confirmed 15 November 2026), although the legend of the 13-decisions document says green |
| — | Natal wheel redesign after the visual specification of 15 November 2026 | Done (v0.6.0). Drawn in screen pixels so text keeps its size. Awaiting: larger picture of the Capricorn and Pluto glyphs (not changed yet). Natal aspect lines end at the inner edge of each planet's label with a dot, and hovering or clicking a planet highlights its lines (feedback of 15 November 2026, v0.6.1). Proposed defaults (settings): element colour codes, modern decans with Pluto/Uranus/Neptune (traditional rulers selectable). Provisional: Verdana, minimum wheel radius 270 px |
| 7 | Secondary progressions, rectification | Done (v0.6.0). Progression layer in Live Chart (natal innermost, progressions, transits outermost), always at the same moment as the transits; aspects with "Eksakt"; rectification panel in Live Chart with save as new chart (default) or overwrite. Proposed defaults awaiting feedback (settings): aspect lines between layers run between the exact degrees on the inner circle (alternative: from each layer's own ring); angle methods offered are Naibod in right ascension (default) and in ecliptic longitude. Stated choices: Naibod rate 360°/365.2422 per year; a rectified copy also gets the life events; a progressed angle is compared with natal planets only |
| 8 | Solar Return | **Next.** Unblocked: exact return of the Sun to its natal longitude; default place is the birthplace, changeable |
| 9 | Synodic cycles, event search, reports | Reports need a description first |

## Layout

```
crates/astro-core/   Pure Rust: all astronomy and astrological rules. No Tauri, no UI.
  src/ephemeris.rs   Safe wrapper over vendored Swiss Ephemeris 2.10.03 (vendor/swisseph, built by build.rs)
  src/chart.rs       compute_chart: positions, angles, houses, sect
  src/aspects.rs     find_aspects: orb, applying/separating, out-of-sign
  src/lots.rs        the seven Hermetic lots, lot overview facts, lot aspects (lot_report)
  src/rings.rs       decan and bounds rings of the wheel (wheel_rings): Chaldean decans, modern decans, Egyptian bounds
  src/profections.rs annual and monthly profections, year start rules, age_at / month_at
  src/condition.rs   Planetary Condition: dignity tables, condition_report (every rule), stations
  src/progressions.rs secondary progressions: day-for-a-year positions, Naibod angles, aspects, exact passes
  src/transits.rs    transit → natal aspects, exact passes of a transit aspect (retrograde series)
  src/time.rs        local time ↔ UTC (tzdb, includes pre-1970 "backzone" history), time navigation steps
  src/places.rs      offline place search over resources/places.tsv
  src/zodiac.rs      Sign, Body, ZodiacPoint, whole_sign_house
src-tauri/           App shell: commands (src/lib.rs), SQLite storage (src/db.rs), updater
src/                 React + TypeScript interface. Draws only; no astrological logic here.
  api.ts             Every backend call. astro.ts: types and Danish names. settings.tsx: remembered settings.
  conditionText.ts   Planetary Condition: matrix rows, rule and source texts, the reason of each condition
  liveFilter.ts      Which transit and progression aspects a Live Chart shows: body choices per layer, Time Lord filters
  rectification.ts   Clock arithmetic for adjusting the birth time in Live Chart
  wheelLayout.ts     Wheel geometry: spreading upright labels apart, aspect line width
  components/        ChartWheel (SVG in screen pixels, optional transit ring), LotSymbol, AspectTable, PositionsTable, LotsTable, LotAspectTable,
                     ConditionPanel, ProfectionPanel, TimeNavigator, TransitAspectTable, LifeEventsPanel
  views/             StartView, ArchiveView, ChartView, LiveChartView, TransitView, ChartForm, SettingsView, ChangelogView
  changelog.ts       What each version added and changed; shown when the version number is pressed
  dev/               Stand-in backend + fixture for working on screens in a plain browser
resources/           ephe/*.se1 (1800–2399), places.tsv (GeoNames, built by scripts/build-places.mjs)
scripts/e2e-check.mjs  Drives the running app end to end
```

Conventions:

- New calculations go in `astro-core` with unit tests, are exposed through a command in `src-tauri/src/lib.rs`, typed in `src/astro.ts`, and called via `src/api.ts`. Add a matching case to `src/dev/mockBackend.ts`.
- Longitudes are tropical ecliptic degrees in [0, 360); use `normalize_degrees`. Display truncates to whole arc-minutes (`ZodiacPoint`), never rounds up. Lots are the decided exception: shown rounded to the nearest minute, or second (`lotReading` in `src/astro.ts`), without ever rounding into the next sign.
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

0. Add an entry at the top of `src/changelog.ts` (Danish, split into added and changed); `pnpm test` fails if the newest entry is not the version in `package.json`.
1. Set the same version in `package.json` (`"version"`) and the root `Cargo.toml` (`[workspace.package]`), then `cargo update --workspace --offline` to refresh `Cargo.lock`.
2. Commit, `git tag vX.Y.Z`, `git push origin main vX.Y.Z`.
3. The `Release` workflow runs all tests, builds the NSIS installer, signs the update and publishes it. Watch it with `gh run watch <id> --exit-status` in the background.
4. Confirm `https://github.com/CurryDK/astrologiprogrammet/releases/latest/download/latest.json` shows the new version.

Notes:

- The update signing key is at `%USERPROFILE%\.tauri\astrologiprogrammet.key` (no password) and in the repository secret `TAURI_SIGNING_PRIVATE_KEY`. If the secret must be set again, use Bash (`gh secret set NAME < file`); piping through PowerShell adds a byte-order mark that breaks signing.
- The repository is public. Keep personal details out of tracked files, and keep `docs/` ignored. Commits use the GitHub no-reply address configured in this repository.
- The project is AGPL-3.0-or-later because Swiss Ephemeris requires it.
