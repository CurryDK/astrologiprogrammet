//! Annual and monthly profections (specification §7).
//!
//! Annual: house 1 at age 0, one whole-sign house forward at each birthday,
//! repeating every 12 years; the traditional ruler of that house's sign is
//! the year's Time Lord. Monthly: starts in the year's house and moves one
//! house forward for each of 12 months, where the 12 months are the interval
//! between two birthdays cut into 12 equal parts (not 30-day months).
//!
//! The specification says "birthday" without defining the exact moment, so
//! that is a choice ([`YearStart`], [`LeapDayBirthday`]). Daily profections
//! are deliberately absent.

use std::fmt;

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::{Deserialize, Serialize};

use crate::ephemeris::{self, EphemerisError};
use crate::ffi;
use crate::normalize_degrees;
use crate::time::{TimeError, ZoneChoice, resolve_recurring, utc_offset_at};
use crate::zodiac::{Body, Sign};

/// Highest age a profection year is calculated for.
pub const MAX_AGE: u32 = 150;

/// The moment a profection year begins.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum YearStart {
    /// The calendar birthday at the clock time of birth, in the birthplace's
    /// time zone. With an unknown birth time: 12:00, like the chart itself.
    BirthClockTime,
    /// The calendar birthday at 00:00 in the birthplace's time zone.
    Midnight,
    /// The moment the Sun returns to its natal longitude.
    SolarReturn,
}

/// The birthday of someone born on 29 February in years without that date.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LeapDayBirthday {
    February28,
    March1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfectionOptions {
    pub year_start: YearStart,
    /// Not used with [`YearStart::SolarReturn`].
    pub leap_day: LeapDayBirthday,
}

/// The birth as entered: local date, clock time if known, and zone.
#[derive(Debug, Clone, PartialEq)]
pub struct Birth {
    pub date: NaiveDate,
    pub time: Option<NaiveTime>,
    pub zone: ZoneChoice,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProfectionError {
    Time(TimeError),
    Ephemeris(EphemerisError),
    /// The age is above [`MAX_AGE`] or leads outside the calendar.
    AgeOutOfRange(u32),
}

impl fmt::Display for ProfectionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Time(e) => e.fmt(f),
            Self::Ephemeris(e) => e.fmt(f),
            Self::AgeOutOfRange(age) => write!(f, "age {age} is out of range"),
        }
    }
}

impl std::error::Error for ProfectionError {}

impl From<TimeError> for ProfectionError {
    fn from(e: TimeError) -> Self {
        Self::Time(e)
    }
}

impl From<EphemerisError> for ProfectionError {
    fn from(e: EphemerisError) -> Self {
        Self::Ephemeris(e)
    }
}

/// An instant, with the clock reading at the birthplace for display.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Moment {
    pub utc: DateTime<Utc>,
    /// Date and clock time in the birthplace's time zone at that instant.
    pub local: NaiveDateTime,
    pub offset_seconds: i32,
}

impl Moment {
    /// An instant with its clock reading in a zone.
    pub fn in_zone(utc: DateTime<Utc>, zone: &ZoneChoice) -> Result<Moment, TimeError> {
        let offset_seconds = utc_offset_at(zone, utc)?;
        Ok(Moment {
            utc,
            local: (utc + Duration::seconds(offset_seconds as i64)).naive_utc(),
            offset_seconds,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfectionMonth {
    /// 1–12 within the profection year.
    pub number: u8,
    pub start: Moment,
    /// The instant the next month starts.
    pub end: Moment,
    /// Whole-sign house, 1–12.
    pub house: u8,
    pub sign: Sign,
    /// Traditional ruler of the sign: the month's Time Lord.
    pub ruler: Body,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfectionYear {
    /// Completed years at the start of this profection year.
    pub age: u32,
    pub start: Moment,
    /// The next birthday.
    pub end: Moment,
    /// Whole-sign house, 1–12.
    pub house: u8,
    pub sign: Sign,
    /// Traditional ruler of the sign: the year's Time Lord.
    pub time_lord: Body,
    pub months: Vec<ProfectionMonth>,
}

/// The annual profection house (1–12) at an age in completed years.
pub fn annual_house(age: u32) -> u8 {
    (age % 12) as u8 + 1
}

/// The house (1–12) of a month (1–12) in a year whose annual house is given.
pub fn monthly_house(annual_house: u8, month: u8) -> u8 {
    (annual_house - 1 + month - 1) % 12 + 1
}

/// The sign on a whole-sign house (1–12), counted from the rising sign.
pub fn sign_of_house(rising_sign: Sign, house: u8) -> Sign {
    Sign::ALL[(rising_sign.index() + house as usize - 1) % 12]
}

/// The 13 instants that bound 12 equal months between two birthdays.
///
/// Boundary k lies k/12 of the way through, to the nanosecond. The first is
/// `start` and the last is `end` exactly, and each month ends at the very
/// instant the next begins, so there is never a gap or an overlap. The
/// months are equal to the nanosecond whenever the year's length in
/// nanoseconds divides by 12 (always the case for years of whole days);
/// otherwise they differ by at most one nanosecond.
pub fn month_boundaries(start: DateTime<Utc>, end: DateTime<Utc>) -> [DateTime<Utc>; 13] {
    let length = (end - start)
        .num_nanoseconds()
        .expect("a year fits in nanoseconds") as i128;
    std::array::from_fn(|k| {
        let part = (length * k as i128 + 6) / 12;
        start + Duration::nanoseconds(part as i64)
    })
}

/// The calendar birthday in a given year.
fn birthday_in(date: NaiveDate, year: i32, leap_day: LeapDayBirthday) -> Option<NaiveDate> {
    NaiveDate::from_ymd_opt(year, date.month(), date.day()).or_else(|| match leap_day {
        // Only 29 February can be missing from a year.
        LeapDayBirthday::February28 => NaiveDate::from_ymd_opt(year, 2, 28),
        LeapDayBirthday::March1 => NaiveDate::from_ymd_opt(year, 3, 1),
    })
}

/// Length of the tropical year in days; only a first guess for the search.
const TROPICAL_YEAR_DAYS: f64 = 365.242_19;

/// The moment nearest `guess` at which the Sun has the given longitude.
fn sun_return(longitude: f64, guess: DateTime<Utc>) -> Result<DateTime<Utc>, EphemerisError> {
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

/// The instant the profection year for `age` begins.
pub fn year_start(
    birth: &Birth,
    options: &ProfectionOptions,
    age: u32,
) -> Result<DateTime<Utc>, ProfectionError> {
    if age > MAX_AGE + 1 {
        return Err(ProfectionError::AgeOutOfRange(age));
    }
    match options.year_start {
        YearStart::BirthClockTime | YearStart::Midnight => {
            let date = birthday_in(birth.date, birth.date.year() + age as i32, options.leap_day)
                .ok_or(ProfectionError::AgeOutOfRange(age))?;
            let time = match options.year_start {
                YearStart::Midnight => Some(NaiveTime::MIN),
                _ => birth.time,
            };
            Ok(resolve_recurring(date, time, &birth.zone)?.utc)
        }
        YearStart::SolarReturn => {
            let born = resolve_recurring(birth.date, birth.time, &birth.zone)?.utc;
            if age == 0 {
                return Ok(born);
            }
            let natal_sun = ephemeris::body_position(ephemeris::julian_day(born)?, ffi::SE_SUN)?;
            let guess_ns = age as f64 * TROPICAL_YEAR_DAYS * 86_400e9;
            Ok(sun_return(
                natal_sun.longitude,
                born + Duration::nanoseconds(guess_ns as i64),
            )?)
        }
    }
}

/// The age (completed profection years) at an instant; `None` before year 0 begins.
pub fn age_at(
    birth: &Birth,
    options: &ProfectionOptions,
    instant: DateTime<Utc>,
) -> Result<Option<u32>, ProfectionError> {
    if instant < year_start(birth, options, 0)? {
        return Ok(None);
    }
    let mut age = (instant.year() - birth.date.year()).clamp(0, MAX_AGE as i32) as u32;
    // The calendar-year difference is right or one off either way.
    while age > 0 && instant < year_start(birth, options, age)? {
        age -= 1;
    }
    while age < MAX_AGE && instant >= year_start(birth, options, age + 1)? {
        age += 1;
    }
    Ok(Some(age))
}

/// The month (1–12) of a profection year that holds an instant, if any.
pub fn month_at(year: &ProfectionYear, instant: DateTime<Utc>) -> Option<u8> {
    year.months
        .iter()
        .find(|m| m.start.utc <= instant && instant < m.end.utc)
        .map(|m| m.number)
}

/// The profection year that begins at the given age, with its 12 months.
pub fn profection_year(
    birth: &Birth,
    rising_sign: Sign,
    options: &ProfectionOptions,
    age: u32,
) -> Result<ProfectionYear, ProfectionError> {
    if age > MAX_AGE {
        return Err(ProfectionError::AgeOutOfRange(age));
    }
    let start = year_start(birth, options, age)?;
    let end = year_start(birth, options, age + 1)?;
    let boundaries = month_boundaries(start, end);
    let mut moments = Vec::with_capacity(13);
    for utc in boundaries {
        moments.push(Moment::in_zone(utc, &birth.zone)?);
    }

    let house = annual_house(age);
    let sign = sign_of_house(rising_sign, house);
    let months = (1..=12u8)
        .map(|number| {
            let month_house = monthly_house(house, number);
            let month_sign = sign_of_house(rising_sign, month_house);
            ProfectionMonth {
                number,
                start: moments[number as usize - 1],
                end: moments[number as usize],
                house: month_house,
                sign: month_sign,
                ruler: month_sign.ruler(),
            }
        })
        .collect();

    Ok(ProfectionYear {
        age,
        start: moments[0],
        end: moments[12],
        house,
        sign,
        time_lord: sign.ruler(),
        months,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    const BIRTH_TIME: ProfectionOptions = ProfectionOptions {
        year_start: YearStart::BirthClockTime,
        leap_day: LeapDayBirthday::February28,
    };

    fn birth(y: i32, m: u32, d: u32, time: Option<(u32, u32)>) -> Birth {
        Birth {
            date: NaiveDate::from_ymd_opt(y, m, d).unwrap(),
            time: time.map(|(h, min)| NaiveTime::from_hms_opt(h, min, 0).unwrap()),
            zone: ZoneChoice::Named("Europe/Copenhagen".into()),
        }
    }

    fn utc(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    fn init_ephemeris() {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
        ephemeris::init(&dir).expect("ephemeris data files are present");
    }

    /// Every month ends where the next begins, and the 12 span the year.
    fn assert_tiles(year: &ProfectionYear) {
        assert_eq!(year.months.len(), 12);
        assert_eq!(year.months[0].start, year.start);
        assert_eq!(year.months[11].end, year.end);
        for pair in year.months.windows(2) {
            assert_eq!(pair[0].end, pair[1].start);
        }
        for month in &year.months {
            assert!(month.start.utc < month.end.utc);
        }
    }

    fn month_lengths(year: &ProfectionYear) -> Vec<Duration> {
        year.months.iter().map(|m| m.end.utc - m.start.utc).collect()
    }

    #[test]
    fn the_annual_cycle_starts_in_house_1_and_repeats_after_12_years() {
        assert_eq!(annual_house(0), 1);
        assert_eq!(annual_house(1), 2);
        assert_eq!(annual_house(11), 12);
        assert_eq!(annual_house(12), 1);
        assert_eq!(annual_house(13), 2);
        assert_eq!(annual_house(62), 3);
    }

    #[test]
    fn the_year_takes_the_sign_and_traditional_ruler_of_its_house() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        let year = |age| profection_year(&born, Sign::Cancer, &BIRTH_TIME, age).unwrap();

        let y0 = year(0);
        assert_eq!((y0.house, y0.sign, y0.time_lord), (1, Sign::Cancer, Body::Moon));
        let y11 = year(11);
        assert_eq!((y11.house, y11.sign, y11.time_lord), (12, Sign::Gemini, Body::Mercury));
        let y12 = year(12);
        assert_eq!((y12.house, y12.sign, y12.time_lord), (1, Sign::Cancer, Body::Moon));
        let y13 = year(13);
        assert_eq!((y13.house, y13.sign, y13.time_lord), (2, Sign::Leo, Body::Sun));
        // Aquarius gets Saturn, not Uranus.
        let y7 = year(7);
        assert_eq!((y7.house, y7.sign, y7.time_lord), (8, Sign::Aquarius, Body::Saturn));
    }

    #[test]
    fn months_start_in_the_years_house_and_move_one_house_each() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        // Age 13: house 2, Leo.
        let year = profection_year(&born, Sign::Cancer, &BIRTH_TIME, 13).unwrap();
        let houses: Vec<u8> = year.months.iter().map(|m| m.house).collect();
        assert_eq!(houses, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1]);
        assert_eq!(year.months[0].sign, Sign::Leo);
        assert_eq!(year.months[0].ruler, Body::Sun);
        assert_eq!(year.months[1].sign, Sign::Virgo);
        assert_eq!(year.months[11].sign, Sign::Cancer);
        assert_eq!(year.months[11].ruler, Body::Moon);
        assert_eq!(year.months.iter().map(|m| m.number).collect::<Vec<_>>(), (1..=12).collect::<Vec<_>>());
    }

    #[test]
    fn a_year_runs_from_birthday_to_birthday_at_the_birth_clock_time() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        let year = profection_year(&born, Sign::Cancer, &BIRTH_TIME, 40).unwrap();
        // Copenhagen is UTC+1 in February.
        assert_eq!(year.start.utc, utc(2002, 2, 4, 13, 20));
        assert_eq!(year.end.utc, utc(2003, 2, 4, 13, 20));
        assert_eq!(year.start.local.to_string(), "2002-02-04 14:20:00");
        assert_eq!(year.start.offset_seconds, 3600);
    }

    #[test]
    fn the_12_months_are_exactly_equal_and_tile_a_365_day_year() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        let year = profection_year(&born, Sign::Cancer, &BIRTH_TIME, 39).unwrap();
        assert_eq!(year.end.utc - year.start.utc, Duration::days(365));
        assert_tiles(&year);
        // 365 days / 12 = 30 days 10 hours, exactly.
        let expected = Duration::days(30) + Duration::hours(10);
        assert!(month_lengths(&year).iter().all(|&length| length == expected));
    }

    #[test]
    fn the_12_months_are_exactly_equal_and_tile_a_366_day_year() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        // 4 February 2004 to 4 February 2005 holds 29 February 2004.
        let year = profection_year(&born, Sign::Cancer, &BIRTH_TIME, 42).unwrap();
        assert_eq!(year.end.utc - year.start.utc, Duration::days(366));
        assert_tiles(&year);
        // 366 days / 12 = 30 days 12 hours, exactly: not a 30-day month.
        let expected = Duration::days(30) + Duration::hours(12);
        assert!(month_lengths(&year).iter().all(|&length| length == expected));
    }

    #[test]
    fn month_starts_are_shown_in_the_birthplaces_clock_with_summer_time() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        let year = profection_year(&born, Sign::Cancer, &BIRTH_TIME, 39).unwrap();
        // Month 2 starts 30 d 10 h after 4 Feb 2001 13:20 UTC.
        assert_eq!(year.months[1].start.utc, utc(2001, 3, 6, 23, 20));
        assert_eq!(year.months[1].start.local.to_string(), "2001-03-07 00:20:00");
        // Month 4 starts in summer time (UTC+2).
        assert_eq!(year.months[3].start.utc, utc(2001, 5, 6, 19, 20));
        assert_eq!(year.months[3].start.offset_seconds, 7200);
        assert_eq!(year.months[3].start.local.to_string(), "2001-05-06 21:20:00");
    }

    #[test]
    fn consecutive_years_join_without_gap_or_overlap() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        for age in 0..30 {
            let this = profection_year(&born, Sign::Aries, &BIRTH_TIME, age).unwrap();
            let next = profection_year(&born, Sign::Aries, &BIRTH_TIME, age + 1).unwrap();
            assert_eq!(this.end, next.start);
            assert_tiles(&this);
        }
    }

    #[test]
    fn a_leap_day_birth_uses_29_february_when_the_year_has_one() {
        let born = birth(1960, 2, 29, Some((8, 0)));
        let year = profection_year(&born, Sign::Aries, &BIRTH_TIME, 4).unwrap();
        assert_eq!(year.start.utc, utc(1964, 2, 29, 7, 0));
    }

    #[test]
    fn a_leap_day_birth_follows_the_chosen_rule_in_other_years() {
        let born = birth(1960, 2, 29, Some((8, 0)));
        let march = ProfectionOptions { leap_day: LeapDayBirthday::March1, ..BIRTH_TIME };

        let feb = profection_year(&born, Sign::Aries, &BIRTH_TIME, 1).unwrap();
        assert_eq!(feb.start.utc, utc(1961, 2, 28, 7, 0));
        assert_eq!(feb.end.utc, utc(1962, 2, 28, 7, 0));

        let mar = profection_year(&born, Sign::Aries, &march, 1).unwrap();
        assert_eq!(mar.start.utc, utc(1961, 3, 1, 7, 0));
        assert_eq!(mar.end.utc, utc(1962, 3, 1, 7, 0));
    }

    #[test]
    fn leap_day_births_tile_with_equal_months_across_the_four_year_cycle() {
        let born = birth(1960, 2, 29, Some((8, 0)));
        for leap_day in [LeapDayBirthday::February28, LeapDayBirthday::March1] {
            let options = ProfectionOptions { leap_day, ..BIRTH_TIME };
            let mut total = Duration::zero();
            for age in 0..8 {
                let year = profection_year(&born, Sign::Aries, &options, age).unwrap();
                assert_tiles(&year);
                let lengths = month_lengths(&year);
                assert!(lengths.iter().all(|&length| length == lengths[0]));
                assert_eq!(lengths[0] * 12, year.end.utc - year.start.utc);
                total += year.end.utc - year.start.utc;
            }
            // 29 Feb 1960 to 29 Feb 1968: eight years with two leap days.
            assert_eq!(total, Duration::days(8 * 365 + 2));
        }
    }

    #[test]
    fn a_year_that_does_not_divide_by_12_still_tiles_to_the_nanosecond() {
        let start = utc(2001, 2, 4, 13, 20);
        // One second more than 365 days: not divisible by 12 in nanoseconds.
        let end = start + Duration::days(365) + Duration::seconds(1);
        let b = month_boundaries(start, end);
        assert_eq!(b[0], start);
        assert_eq!(b[12], end);
        let lengths: Vec<i64> = b.windows(2).map(|w| (w[1] - w[0]).num_nanoseconds().unwrap()).collect();
        let (min, max) = (lengths.iter().min().unwrap(), lengths.iter().max().unwrap());
        assert!(max - min <= 1, "months differ by {} ns", max - min);
        assert_eq!(lengths.iter().sum::<i64>(), (end - start).num_nanoseconds().unwrap());
    }

    #[test]
    fn midnight_rule_starts_the_year_at_0000_local_time() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        let options = ProfectionOptions { year_start: YearStart::Midnight, ..BIRTH_TIME };
        let year = profection_year(&born, Sign::Cancer, &options, 40).unwrap();
        assert_eq!(year.start.local.to_string(), "2002-02-04 00:00:00");
        assert_eq!(year.start.utc, utc(2002, 2, 3, 23, 0));
    }

    #[test]
    fn an_unknown_birth_time_is_taken_as_noon() {
        let born = birth(1950, 6, 15, None);
        let year = profection_year(&born, Sign::Aries, &BIRTH_TIME, 30).unwrap();
        assert_eq!(year.start.local.to_string(), "1980-06-15 12:00:00");
    }

    #[test]
    fn a_birth_clock_time_skipped_by_summer_time_still_gives_a_birthday() {
        // Born 29 March 1990 at 02:30; in 2020 that clock time was skipped.
        let born = birth(1990, 3, 29, Some((2, 30)));
        let year = profection_year(&born, Sign::Aries, &BIRTH_TIME, 30).unwrap();
        assert_eq!(year.start.utc, utc(2020, 3, 29, 1, 30));
        assert_tiles(&year);
    }

    #[test]
    fn age_and_month_at_an_instant() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        let age = |instant| age_at(&born, &BIRTH_TIME, instant).unwrap();
        assert_eq!(age(utc(1962, 2, 4, 13, 19)), None);
        assert_eq!(age(utc(1962, 2, 4, 13, 20)), Some(0));
        assert_eq!(age(utc(2002, 2, 4, 13, 19)), Some(39));
        assert_eq!(age(utc(2002, 2, 4, 13, 20)), Some(40));
        assert_eq!(age(utc(2002, 12, 31, 0, 0)), Some(40));

        let year = profection_year(&born, Sign::Cancer, &BIRTH_TIME, 39).unwrap();
        assert_eq!(month_at(&year, utc(2001, 2, 4, 13, 20)), Some(1));
        assert_eq!(month_at(&year, utc(2001, 3, 6, 23, 19)), Some(1));
        assert_eq!(month_at(&year, utc(2001, 3, 6, 23, 20)), Some(2));
        assert_eq!(month_at(&year, utc(2002, 2, 4, 13, 19)), Some(12));
        assert_eq!(month_at(&year, utc(2002, 2, 4, 13, 20)), None);
    }

    #[test]
    fn ages_beyond_the_limit_are_refused() {
        let born = birth(1962, 2, 4, Some((14, 20)));
        let result = profection_year(&born, Sign::Aries, &BIRTH_TIME, MAX_AGE + 1);
        assert_eq!(result, Err(ProfectionError::AgeOutOfRange(MAX_AGE + 1)));
    }

    #[test]
    fn solar_return_rule_starts_each_year_when_the_sun_is_back() {
        init_ephemeris();
        let born = birth(1962, 2, 4, Some((14, 20)));
        let options = ProfectionOptions { year_start: YearStart::SolarReturn, ..BIRTH_TIME };
        let born_utc = utc(1962, 2, 4, 13, 20);
        let sun_at = |t: DateTime<Utc>| {
            ephemeris::body_position(ephemeris::julian_day(t).unwrap(), ffi::SE_SUN)
                .unwrap()
                .longitude
        };
        let natal = sun_at(born_utc);

        let y0 = profection_year(&born, Sign::Cancer, &options, 0).unwrap();
        assert_eq!(y0.start.utc, born_utc);

        for age in [1, 2, 3, 4, 40, 64] {
            let year = profection_year(&born, Sign::Cancer, &options, age).unwrap();
            // Back at the natal longitude to well under a tenth of an arc-second.
            assert!((sun_at(year.start.utc) - natal).abs() < 1e-5, "age {age}");
            // And it is the return of that year: within two days of the calendar birthday.
            let birthday = utc(1962 + age as i32, 2, 4, 13, 20);
            assert!((year.start.utc - birthday).num_hours().abs() < 48, "age {age}");
            assert_tiles(&year);
            let lengths: Vec<i64> =
                month_lengths(&year).iter().map(|d| d.num_nanoseconds().unwrap()).collect();
            assert!(lengths.iter().max().unwrap() - lengths.iter().min().unwrap() <= 1);
            let previous = profection_year(&born, Sign::Cancer, &options, age - 1).unwrap();
            assert_eq!(previous.end, year.start);
        }
    }
}
