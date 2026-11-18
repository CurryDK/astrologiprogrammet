//! Solar Return: the moments the transiting Sun is back at its natal
//! longitude (decision supplement of 14 November 2026, point 3).
//!
//! The return is exact: the apparent geocentric tropical longitude of the
//! Sun equals the natal one, with no rounding to a degree or to a birthday.
//! Returns are numbered by the age they begin: number 0 is the birth itself.

use chrono::{DateTime, Duration, Utc};

use crate::ephemeris::{self, EphemerisError};
use crate::ffi;
use crate::normalize_degrees;
use crate::profections::MAX_AGE;

/// The highest return number offered.
pub const MAX_RETURN: u32 = MAX_AGE;

/// Length of the tropical year in days; only a first guess for the search.
const TROPICAL_YEAR_DAYS: f64 = 365.242_19;

/// The moment nearest `guess` at which the Sun has the given longitude.
pub(crate) fn sun_return(longitude: f64, guess: DateTime<Utc>) -> Result<DateTime<Utc>, EphemerisError> {
    let mut t = guess;
    for _ in 0..30 {
        let sun = ephemeris::body_position(ephemeris::julian_day(t)?, ffi::SE_SUN)?;
        // Signed distance still to travel, in (-180, 180].
        let ahead = 180.0 - normalize_degrees(180.0 - (longitude - sun.longitude));
        let step_ns = ahead / sun.speed * 86_400e9;
        t += Duration::nanoseconds(step_ns.round() as i64);
        // Below the resolution of a Julian day held in a double.
        if step_ns.abs() < 50_000.0 {
            break;
        }
    }
    Ok(t)
}

/// The moment of Solar Return `number` after a birth at `born`.
pub fn return_moment(born: DateTime<Utc>, number: u32) -> Result<DateTime<Utc>, EphemerisError> {
    if number == 0 {
        return Ok(born);
    }
    let natal_sun = ephemeris::body_position(ephemeris::julian_day(born)?, ffi::SE_SUN)?;
    let guess_ns = number as f64 * TROPICAL_YEAR_DAYS * 86_400e9;
    sun_return(natal_sun.longitude, born + Duration::nanoseconds(guess_ns as i64))
}

/// The number of the Solar Return in force at an instant: the latest one
/// that has occurred, until the next occurs. 0 at or before the first return.
pub fn active_return(born: DateTime<Utc>, at: DateTime<Utc>) -> Result<u32, EphemerisError> {
    if at <= born {
        return Ok(0);
    }
    let days = (at - born).num_seconds() as f64 / 86_400.0;
    let mut number = ((days / TROPICAL_YEAR_DAYS) as u32).min(MAX_RETURN);
    // The estimate is right or one off either way.
    while number > 0 && return_moment(born, number)? > at {
        number -= 1;
    }
    while number < MAX_RETURN {
        match return_moment(born, number + 1) {
            Ok(next) if next <= at => number += 1,
            // The next return lies after the instant, or outside the data files.
            _ => break,
        }
    }
    Ok(number)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::path::PathBuf;

    fn init() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
        ephemeris::init(&dir).expect("ephemeris data files are present");
    }

    fn sun_at(utc: DateTime<Utc>) -> f64 {
        ephemeris::body_position(ephemeris::julian_day(utc).unwrap(), ffi::SE_SUN)
            .unwrap()
            .longitude
    }

    #[test]
    fn the_sun_is_back_at_its_natal_longitude() {
        init();
        let born = Utc.with_ymd_and_hms(1962, 2, 4, 13, 20, 0).unwrap();
        let natal = sun_at(born);
        for number in [1, 2, 30, 64, 99] {
            let moment = return_moment(born, number).unwrap();
            let difference = normalize_degrees(sun_at(moment) - natal + 180.0) - 180.0;
            // A thousandth of an arc-second.
            assert!(difference.abs() < 3e-7, "return {number}: off by {difference}°");
            // Within a day and a half of the calendar birthday.
            let birthday = Utc.with_ymd_and_hms(1962 + number as i32, 2, 4, 13, 20, 0).unwrap();
            assert!((moment - birthday).abs() < Duration::hours(36), "return {number} at {moment}");
        }
    }

    #[test]
    fn return_zero_is_the_birth() {
        init();
        let born = Utc.with_ymd_and_hms(1990, 7, 1, 3, 0, 0).unwrap();
        assert_eq!(return_moment(born, 0).unwrap(), born);
    }

    /// Independent of Swiss Ephemeris: the published instants of the March
    /// equinox (Sun at 0° Aries), to the minute: 2000-03-20 07:35 UTC,
    /// 2025-03-20 09:01 UTC and 2026-03-20 14:46 UTC. A birth at the first
    /// has its returns at the others.
    #[test]
    fn returns_of_an_equinox_birth_fall_on_the_published_equinoxes() {
        init();
        let born = Utc.with_ymd_and_hms(2000, 3, 20, 7, 35, 0).unwrap();
        let expected = [
            (25, Utc.with_ymd_and_hms(2025, 3, 20, 9, 1, 0).unwrap()),
            (26, Utc.with_ymd_and_hms(2026, 3, 20, 14, 46, 0).unwrap()),
        ];
        for (number, published) in expected {
            let moment = return_moment(born, number).unwrap();
            assert!(
                (moment - published).abs() < Duration::minutes(2),
                "return {number} at {moment}, published {published}"
            );
        }
    }

    #[test]
    fn the_active_return_is_the_latest_that_has_occurred() {
        init();
        let born = Utc.with_ymd_and_hms(1962, 2, 4, 13, 20, 0).unwrap();
        let r64 = return_moment(born, 64).unwrap();
        let r65 = return_moment(born, 65).unwrap();
        assert_eq!(active_return(born, r64).unwrap(), 64);
        assert_eq!(active_return(born, r64 - Duration::seconds(1)).unwrap(), 63);
        assert_eq!(active_return(born, r65 - Duration::seconds(1)).unwrap(), 64);
        assert_eq!(active_return(born, r65 + Duration::days(200)).unwrap(), 65);
        // Not the calendar year's return: in January the return of the year before is in force.
        let january = Utc.with_ymd_and_hms(2026, 1, 10, 0, 0, 0).unwrap();
        assert_eq!(active_return(born, january).unwrap(), 63);
    }

    #[test]
    fn before_the_first_return_the_birth_is_in_force() {
        init();
        let born = Utc.with_ymd_and_hms(2000, 6, 1, 12, 0, 0).unwrap();
        assert_eq!(active_return(born, born - Duration::days(10)).unwrap(), 0);
        assert_eq!(active_return(born, born + Duration::days(100)).unwrap(), 0);
    }
}
