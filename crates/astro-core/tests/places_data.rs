//! Checks the bundled place list itself, not just the search code.

use std::collections::BTreeSet;
use std::path::PathBuf;

use astro_core::places::PlaceIndex;
use astro_core::time::{ZoneChoice, resolve};
use chrono::NaiveDate;

fn load() -> PlaceIndex {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/places.tsv");
    let tsv = std::fs::read_to_string(path).expect("places file is present");
    PlaceIndex::parse(&tsv).expect("places file parses")
}

#[test]
fn danish_towns_are_found_by_their_danish_names() {
    let index = load();
    assert!(index.len() > 100_000);

    let copenhagen = index.search("København", 5);
    assert_eq!(copenhagen[0].name, "Copenhagen");
    assert_eq!(copenhagen[0].country_code, "DK");
    assert_eq!(copenhagen[0].zone, "Europe/Copenhagen");

    for town in ["Århus", "Odense", "Aalborg", "Skagen", "Rønne", "Tórshavn", "Nuuk"] {
        let found = index.search(town, 5);
        assert!(!found.is_empty(), "{town} not found");
    }
}

#[test]
fn every_time_zone_in_the_place_list_is_known() {
    let index = load();
    let zones: BTreeSet<&str> = index.places().iter().map(|p| p.zone.as_str()).collect();
    let date = NaiveDate::from_ymd_opt(2000, 6, 1).unwrap();
    let unknown: Vec<&str> = zones
        .into_iter()
        .filter(|zone| resolve(date, None, &ZoneChoice::Named(zone.to_string())).is_err())
        .collect();
    assert!(unknown.is_empty(), "zones missing from the time zone data: {unknown:?}");
}

#[test]
fn coordinates_are_plausible() {
    let index = load();
    for place in index.places() {
        assert!((-90.0..=90.0).contains(&place.latitude), "{}", place.name);
        assert!((-180.0..=180.0).contains(&place.longitude), "{}", place.name);
    }
}
