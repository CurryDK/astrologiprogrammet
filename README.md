# Astrologiprogrammet

A private desktop program for Hellenistic astrology (tropical zodiac, whole-sign
houses, traditional rulers), built with Tauri.

## Development

```
pnpm install
pnpm tauri dev      # run the app
pnpm test           # interface tests
cargo test --workspace
```

Pushing a tag such as `v0.1.0` builds the Windows installer and publishes it as
a GitHub release; installed copies update themselves from it.

## Licences and data sources

- The program is licensed under the GNU AGPL 3.0 or later (see `LICENSE`).
- Planet positions come from the [Swiss Ephemeris](https://www.astro.com/swisseph/)
  by Astrodienst AG, used under the AGPL. Its source is in
  `crates/astro-core/vendor/swisseph` and its data files in `resources/ephe`.
- The place list in `resources/places.tsv` is derived from
  [GeoNames](https://www.geonames.org) data, licensed CC BY 4.0. It is built by
  `scripts/build-places.mjs`.
- Time zone history comes from the IANA Time Zone Database via the `tzdb` crate.
