//! Checks computed positions against values that do not come from Swiss
//! Ephemeris itself.

use std::path::PathBuf;

use astro_core::chart::{Sect, compute_chart};
use astro_core::ephemeris;
use astro_core::normalize_degrees;
use astro_core::zodiac::{Body, Sign};
use chrono::{DateTime, TimeZone, Utc};

fn init() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
    ephemeris::init(&dir).expect("ephemeris data files are present");
}

fn angular_difference(a: f64, b: f64) -> f64 {
    let d = normalize_degrees(a - b);
    d.min(360.0 - d)
}

/// Apparent geocentric ecliptic longitudes of date from NASA JPL Horizons
/// (observer table, centre 500@399, quantity 31), fetched 2026-11-14.
const HORIZONS: [(&str, [(Body, f64); 10]); 2] = [
    (
        "2000-01-01T12:00:00Z",
        [
            (Body::Sun, 280.3689092),
            (Body::Moon, 223.3237860),
            (Body::Mercury, 271.8892699),
            (Body::Venus, 241.5657794),
            (Body::Mars, 327.9632921),
            (Body::Jupiter, 25.2530685),
            (Body::Saturn, 40.3956366),
            (Body::Uranus, 314.8091680),
            (Body::Neptune, 303.1930007),
            (Body::Pluto, 251.4547644),
        ],
    ),
    (
        "1950-06-15T06:30:00Z",
        [
            (Body::Sun, 83.5908313),
            (Body::Moon, 79.2196656),
            (Body::Mercury, 60.8115243),
            (Body::Venus, 45.7745507),
            (Body::Mars, 181.2851772),
            (Body::Jupiter, 337.2316129),
            (Body::Saturn, 163.3915535),
            (Body::Uranus, 94.4650707),
            (Body::Neptune, 194.6088110),
            (Body::Pluto, 136.2796024),
        ],
    ),
];

#[test]
fn planet_longitudes_match_jpl_horizons() {
    init();
    // One arc-second.
    let tolerance = 1.0 / 3600.0;
    for (instant, bodies) in HORIZONS {
        let utc: DateTime<Utc> = instant.parse().unwrap();
        let chart = compute_chart(utc, 55.6761, 12.5683).unwrap();
        for (body, expected) in bodies {
            let actual = chart.position(body).point.longitude;
            let diff = angular_difference(actual, expected);
            assert!(
                diff < tolerance,
                "{body:?} at {instant}: got {actual:.7}, Horizons {expected:.7}, off by {:.2}\"",
                diff * 3600.0
            );
        }
    }
}

/// The angles are checked against the textbook spherical-astronomy formulas,
/// computed here independently of the library's house routine.
#[test]
fn angles_match_the_spherical_formulas() {
    init();
    let cases = [
        ("2000-01-01T12:00:00Z", 55.6761, 12.5683),
        ("1950-06-15T06:30:00Z", 55.6761, 12.5683),
        ("1984-11-03T22:15:00Z", -33.8688, 151.2093),
        ("2024-03-20T03:06:00Z", 0.0, -78.4678),
    ];
    for (instant, latitude, longitude) in cases {
        let utc: DateTime<Utc> = instant.parse().unwrap();
        let chart = compute_chart(utc, latitude, longitude).unwrap();

        let jd = chart.julian_day;
        let obliquity = ephemeris::true_obliquity(jd).unwrap().to_radians();
        let ramc = (ephemeris::sidereal_time(jd).unwrap() * 15.0 + longitude).to_radians();
        let phi = latitude.to_radians();

        let mc = ramc.sin().atan2(ramc.cos() * obliquity.cos()).to_degrees();
        let asc = ramc
            .cos()
            .atan2(-(ramc.sin() * obliquity.cos() + phi.tan() * obliquity.sin()))
            .to_degrees();

        let tolerance = 1.0 / 3600.0;
        let mc_diff = angular_difference(chart.angles.midheaven.point.longitude, mc);
        let asc_diff = angular_difference(chart.angles.ascendant.point.longitude, asc);
        assert!(mc_diff < tolerance, "MC at {instant}: off by {:.2}\"", mc_diff * 3600.0);
        assert!(asc_diff < tolerance, "ASC at {instant}: off by {:.2}\"", asc_diff * 3600.0);
    }
}

#[test]
fn chart_structure_is_consistent() {
    init();
    let utc = Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap();
    let chart = compute_chart(utc, 55.6761, 12.5683).unwrap();

    assert_eq!(chart.positions.len(), 12);
    assert_eq!(chart.position(Body::Sun).point.sign, Sign::Capricorn);
    assert_eq!(chart.position(Body::Sun).point.degree, 10);
    assert_eq!(chart.position(Body::Sun).point.minute, 22);

    // Saturn was retrograde on 1 January 2000 (direct station 12 January).
    assert!(chart.position(Body::Saturn).retrograde);
    assert!(!chart.position(Body::Sun).retrograde);

    // The south node is exactly opposite the north node.
    let north = chart.position(Body::NorthNode).point.longitude;
    let south = chart.position(Body::SouthNode).point.longitude;
    assert!((angular_difference(north, south) - 180.0).abs() < 1e-9);

    // Whole-sign houses start at the rising sign and run in zodiac order.
    let rising = chart.angles.ascendant.point.sign;
    assert_eq!(chart.houses[0].sign, rising);
    assert_eq!(chart.angles.ascendant.house, 1);
    assert_eq!(chart.angles.descendant.house, 7);
    for (i, house) in chart.houses.iter().enumerate() {
        assert_eq!(house.number as usize, i + 1);
        assert_eq!(house.sign.index(), (rising.index() + i) % 12);
        assert_eq!(house.ruler, house.sign.ruler());
    }
    for position in &chart.positions {
        assert_eq!(chart.houses[position.house as usize - 1].sign, position.point.sign);
    }

    // Local noon in Copenhagen in January: the Sun is up.
    assert_eq!(chart.sect, Sect::Day);
}

#[test]
fn midnight_is_a_night_chart() {
    init();
    let utc = Utc.with_ymd_and_hms(2000, 1, 1, 23, 0, 0).unwrap();
    let chart = compute_chart(utc, 55.6761, 12.5683).unwrap();
    assert_eq!(chart.sect, Sect::Night);
}

#[test]
fn dates_outside_the_data_files_are_rejected() {
    init();
    let utc = Utc.with_ymd_and_hms(1750, 1, 1, 12, 0, 0).unwrap();
    assert_eq!(
        compute_chart(utc, 0.0, 0.0),
        Err(ephemeris::EphemerisError::DateOutOfRange(1750))
    );
}

#[test]
fn missing_data_files_are_reported() {
    let empty = std::env::temp_dir();
    assert!(matches!(
        ephemeris::init(&empty.join("no-such-ephemeris-folder")),
        Err(ephemeris::EphemerisError::MissingDataFile(_))
    ));
}
