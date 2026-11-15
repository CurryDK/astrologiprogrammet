//! Calculation core for Astrologiprogrammet.
//!
//! Everything astronomical and astrological lives here so it can be tested
//! without the app shell. The frontend only draws what this crate computes.

pub mod aspects;
pub mod chart;
pub mod condition;
pub mod ephemeris;
mod ffi;
pub mod lots;
pub mod places;
pub mod profections;
pub mod progressions;
pub mod rings;
pub mod time;
pub mod transits;
pub mod zodiac;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Reduce an ecliptic longitude to the interval [0, 360).
pub fn normalize_degrees(longitude: f64) -> f64 {
    let reduced = longitude.rem_euclid(360.0);
    // rem_euclid can return 360.0 for tiny negative inputs due to rounding.
    if reduced >= 360.0 { 0.0 } else { reduced }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_the_examples_from_the_lots_supplement() {
        assert_eq!(normalize_degrees(-15.0), 345.0);
        assert_eq!(normalize_degrees(375.0), 15.0);
    }

    #[test]
    fn keeps_values_already_in_range() {
        assert_eq!(normalize_degrees(0.0), 0.0);
        assert_eq!(normalize_degrees(359.5), 359.5);
        assert_eq!(normalize_degrees(360.0), 0.0);
    }

    #[test]
    fn never_returns_360() {
        assert!(normalize_degrees(-1e-20) < 360.0);
    }
}
