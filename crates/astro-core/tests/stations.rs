//! Checks the station search against published almanac times, and runs
//! Planetary Condition on a real chart.

use std::path::PathBuf;

use astro_core::chart::compute_chart;
use astro_core::condition::{ConditionOptions, PLANETS, Turn, condition_report, station};
use astro_core::ephemeris;
use astro_core::zodiac::Body;
use chrono::{DateTime, Duration, TimeZone, Utc};

fn init() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
    ephemeris::init(&dir).expect("ephemeris data files are present");
}

fn near(found: DateTime<Utc>, expected: DateTime<Utc>) -> bool {
    (found - expected).abs() < Duration::hours(3)
}

/// Station times as published in astrological almanacs for 2024–2025.
#[test]
fn mercury_stations_of_april_2024() {
    init();
    let during = Utc.with_ymd_and_hms(2024, 4, 10, 0, 0, 0).unwrap();
    let previous = station(Body::Mercury, during, -1).unwrap();
    let next = station(Body::Mercury, during, 1).unwrap();
    assert_eq!(previous.turns, Turn::Retrograde);
    assert!(near(previous.utc, Utc.with_ymd_and_hms(2024, 4, 1, 22, 14, 0).unwrap()), "{previous:?}");
    assert_eq!(next.turns, Turn::Direct);
    assert!(near(next.utc, Utc.with_ymd_and_hms(2024, 4, 25, 12, 54, 0).unwrap()), "{next:?}");
}

#[test]
fn mars_stations_around_new_year_2025() {
    init();
    // Before the retrograde: the next station turns Mars retrograde.
    let before = Utc.with_ymd_and_hms(2024, 9, 1, 0, 0, 0).unwrap();
    let next = station(Body::Mars, before, 1).unwrap();
    assert_eq!(next.turns, Turn::Retrograde);
    assert!(near(next.utc, Utc.with_ymd_and_hms(2024, 12, 6, 23, 33, 0).unwrap()), "{next:?}");
    // After it: the previous station turned Mars direct.
    let after = Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap();
    let previous = station(Body::Mars, after, -1).unwrap();
    assert_eq!(previous.turns, Turn::Direct);
    assert!(near(previous.utc, Utc.with_ymd_and_hms(2025, 2, 24, 2, 0, 0).unwrap()), "{previous:?}");
}

#[test]
fn the_lights_have_no_stations() {
    init();
    let at = Utc.with_ymd_and_hms(2024, 4, 10, 0, 0, 0).unwrap();
    assert!(station(Body::Sun, at, 1).is_none());
    assert!(station(Body::Moon, at, -1).is_none());
}

#[test]
fn a_real_chart_reports_the_seven_planets() {
    init();
    let utc = Utc.with_ymd_and_hms(1962, 2, 4, 13, 20, 0).unwrap();
    let chart = compute_chart(utc, 55.6759, 12.5655).unwrap();
    let report = condition_report(&chart, None, &ConditionOptions::default());
    assert_eq!(report.planets.iter().map(|p| p.body).collect::<Vec<_>>(), PLANETS);
    // The great conjunction in Aquarius of February 1962: every planet
    // there shares the sign with Saturn, its domicile lord.
    let mars = report.planets.iter().find(|p| p.body == Body::Mars).unwrap();
    assert!(mars.conditions.iter().any(|c| c.others == vec![Body::Saturn]));
}
