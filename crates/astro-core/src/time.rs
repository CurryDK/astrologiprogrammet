//! Turning a local date and clock time into UTC (specification §2.1).

use std::fmt;

use chrono::{DateTime, Months, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::{Deserialize, Serialize};

/// Largest offset from UTC we accept, in seconds (no zone has exceeded 16 h).
const MAX_OFFSET_SECONDS: i32 = 16 * 3600;
const DAY_SECONDS: i64 = 86_400;

/// How the offset from UTC is determined.
#[derive(Debug, Clone, PartialEq)]
pub enum ZoneChoice {
    /// An IANA time zone name such as `Europe/Copenhagen`; historic rules
    /// and daylight saving time are applied for the given date.
    Named(String),
    /// A fixed offset in seconds east of UTC, entered by the user when the
    /// zone rules are known to be wrong for a birth.
    FixedOffset(i32),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTime {
    pub utc: DateTime<Utc>,
    /// Offset that was applied, in seconds east of UTC.
    pub offset_seconds: i32,
    /// True when no clock time was given and 12:00 was used.
    pub time_assumed: bool,
    /// True when the clock time occurred twice (clocks set back) and the
    /// first occurrence was used.
    pub ambiguous: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TimeError {
    UnknownZone(String),
    InvalidOffset(i32),
    /// The clock time was skipped when clocks were set forward.
    NonexistentLocalTime(NaiveDateTime),
}

impl fmt::Display for TimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownZone(name) => write!(f, "unknown time zone: {name}"),
            Self::InvalidOffset(seconds) => write!(f, "invalid UTC offset: {seconds} s"),
            Self::NonexistentLocalTime(t) => {
                write!(f, "local time {t} does not exist (clocks were set forward)")
            }
        }
    }
}

impl std::error::Error for TimeError {}

/// Convert a local date and optional clock time to UTC.
/// An unknown clock time is taken as 12:00.
pub fn resolve(
    date: NaiveDate,
    time: Option<NaiveTime>,
    zone: &ZoneChoice,
) -> Result<ResolvedTime, TimeError> {
    let time_assumed = time.is_none();
    let noon = NaiveTime::from_hms_opt(12, 0, 0).expect("12:00 is a valid time");
    let local = date.and_time(time.unwrap_or(noon));

    // The local wall-clock reading expressed as if it were UTC.
    let local_seconds = local.and_utc().timestamp();

    let (offset_seconds, ambiguous) = match zone {
        ZoneChoice::FixedOffset(seconds) => {
            if seconds.abs() > MAX_OFFSET_SECONDS {
                return Err(TimeError::InvalidOffset(*seconds));
            }
            (*seconds, false)
        }
        ZoneChoice::Named(name) => {
            // The IANA database including its pre-1970 "backzone" history,
            // which keeps e.g. Copenhagen distinct from Berlin in the 1940s.
            let tz = tzdb::tz_by_name(name).ok_or_else(|| TimeError::UnknownZone(name.clone()))?;
            let offset_at = |unix: i64| -> Result<i32, TimeError> {
                tz.find_local_time_type(unix)
                    .map(|local_type| local_type.ut_offset())
                    .map_err(|_| TimeError::UnknownZone(name.clone()))
            };

            // The offsets in force a day before and a day after bracket any
            // clock change near the local time. An offset is valid when the
            // UTC instant it implies really has that offset.
            let mut candidates = vec![
                offset_at(local_seconds - DAY_SECONDS)?,
                offset_at(local_seconds + DAY_SECONDS)?,
            ];
            candidates.dedup();
            let mut valid = Vec::new();
            for offset in candidates {
                if offset_at(local_seconds - offset as i64)? == offset {
                    valid.push(offset);
                }
            }
            match valid.as_slice() {
                [] => return Err(TimeError::NonexistentLocalTime(local)),
                [only] => (*only, false),
                // The larger offset gives the earlier UTC instant, i.e. the
                // first time the clock showed this reading.
                several => (*several.iter().max().expect("non-empty"), true),
            }
        }
    };

    let utc = DateTime::<Utc>::from_timestamp(local_seconds - offset_seconds as i64, 0)
        .expect("timestamp within chrono's range")
        + chrono::Duration::nanoseconds(local.and_utc().timestamp_subsec_nanos() as i64);

    Ok(ResolvedTime {
        utc,
        offset_seconds,
        time_assumed,
        ambiguous,
    })
}

/// The offset from UTC, in seconds east, in force in a zone at a UTC instant.
pub fn utc_offset_at(zone: &ZoneChoice, utc: DateTime<Utc>) -> Result<i32, TimeError> {
    match zone {
        ZoneChoice::FixedOffset(seconds) => {
            if seconds.abs() > MAX_OFFSET_SECONDS {
                return Err(TimeError::InvalidOffset(*seconds));
            }
            Ok(*seconds)
        }
        ZoneChoice::Named(name) => {
            let unknown = || TimeError::UnknownZone(name.clone());
            let tz = tzdb::tz_by_name(name).ok_or_else(unknown)?;
            tz.find_local_time_type(utc.timestamp())
                .map(|local_type| local_type.ut_offset())
                .map_err(|_| unknown())
        }
    }
}

/// Like [`resolve`], but a clock time that was skipped when clocks were set
/// forward is not an error: the offset in force before the change is used,
/// which gives the instant that long after the change. Used for recurring
/// dates such as birthdays, which must always resolve to some instant.
pub fn resolve_recurring(
    date: NaiveDate,
    time: Option<NaiveTime>,
    zone: &ZoneChoice,
) -> Result<ResolvedTime, TimeError> {
    match resolve(date, time, zone) {
        Err(TimeError::NonexistentLocalTime(local)) => {
            let local_as_utc = local.and_utc();
            let offset_seconds =
                utc_offset_at(zone, local_as_utc - chrono::Duration::seconds(DAY_SECONDS))?;
            Ok(ResolvedTime {
                utc: local_as_utc - chrono::Duration::seconds(offset_seconds as i64),
                offset_seconds,
                time_assumed: time.is_none(),
                ambiguous: false,
            })
        }
        other => other,
    }
}

/// The clock reading in a zone at a UTC instant.
pub fn local_time_at(zone: &ZoneChoice, utc: DateTime<Utc>) -> Result<NaiveDateTime, TimeError> {
    let offset = utc_offset_at(zone, utc)?;
    Ok((utc + chrono::Duration::seconds(offset as i64)).naive_utc())
}

/// The steps of manual time navigation (specification §8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StepUnit {
    Minute,
    Hour,
    Day,
    Week,
    Month,
}

/// Move an instant `count` steps forward (or back, when negative).
///
/// Minutes and hours are exact durations. Days, weeks and months are
/// calendar steps in the given zone: the clock reading stays the same, also
/// across a change to or from summer time, and a month step lands on the
/// same day of the month, or on the month's last day when it is shorter.
/// `None` when the result is outside the calendar.
pub fn step(
    utc: DateTime<Utc>,
    zone: &ZoneChoice,
    unit: StepUnit,
    count: i32,
) -> Result<Option<DateTime<Utc>>, TimeError> {
    let exact = |seconds: i64| utc.checked_add_signed(chrono::Duration::seconds(seconds * count as i64));
    let local = local_time_at(zone, utc)?;
    let moved = match unit {
        StepUnit::Minute => return Ok(exact(60)),
        StepUnit::Hour => return Ok(exact(3600)),
        StepUnit::Day => local.checked_add_signed(chrono::Duration::days(count as i64)),
        StepUnit::Week => local.checked_add_signed(chrono::Duration::days(7 * count as i64)),
        StepUnit::Month if count >= 0 => local.checked_add_months(Months::new(count as u32)),
        StepUnit::Month => local.checked_sub_months(Months::new(count.unsigned_abs())),
    };
    match moved {
        None => Ok(None),
        Some(moved) => Ok(Some(resolve_recurring(moved.date(), Some(moved.time()), zone)?.utc)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        text.parse().unwrap()
    }

    #[test]
    fn minute_and_hour_steps_are_exact_durations() {
        let t = at("2020-03-29T00:30:00Z");
        assert_eq!(step(t, &copenhagen(), StepUnit::Minute, 1).unwrap(), Some(at("2020-03-29T00:31:00Z")));
        // Across the change to summer time an hour is still an hour.
        assert_eq!(step(t, &copenhagen(), StepUnit::Hour, 1).unwrap(), Some(at("2020-03-29T01:30:00Z")));
        assert_eq!(step(t, &copenhagen(), StepUnit::Hour, -3).unwrap(), Some(at("2020-03-28T21:30:00Z")));
    }

    #[test]
    fn day_and_week_steps_keep_the_clock_reading_across_summer_time() {
        // 28 March 2020 12:00 in Copenhagen (UTC+1); the next day is UTC+2.
        let t = at("2020-03-28T11:00:00Z");
        assert_eq!(step(t, &copenhagen(), StepUnit::Day, 1).unwrap(), Some(at("2020-03-29T10:00:00Z")));
        assert_eq!(step(t, &copenhagen(), StepUnit::Week, 1).unwrap(), Some(at("2020-04-04T10:00:00Z")));
        assert_eq!(step(t, &copenhagen(), StepUnit::Day, -1).unwrap(), Some(at("2020-03-27T11:00:00Z")));
    }

    #[test]
    fn month_steps_keep_the_day_or_stop_at_the_months_end() {
        let zone = ZoneChoice::FixedOffset(0);
        let t = at("2023-01-31T08:15:00Z");
        assert_eq!(step(t, &zone, StepUnit::Month, 1).unwrap(), Some(at("2023-02-28T08:15:00Z")));
        assert_eq!(step(t, &zone, StepUnit::Month, 13).unwrap(), Some(at("2024-02-29T08:15:00Z")));
        assert_eq!(step(t, &zone, StepUnit::Month, -2).unwrap(), Some(at("2022-11-30T08:15:00Z")));
        assert_eq!(step(t, &zone, StepUnit::Month, 2).unwrap(), Some(at("2023-03-31T08:15:00Z")));
    }

    #[test]
    fn local_time_follows_the_zone() {
        let local = local_time_at(&copenhagen(), at("2020-07-01T10:00:00Z")).unwrap();
        assert_eq!(local.to_string(), "2020-07-01 12:00:00");
    }

    #[test]
    fn a_skipped_clock_time_on_a_recurring_date_lands_after_the_change() {
        // 29 March 2020, 02:30 never happened in Copenhagen; with the offset
        // before the change (+1) it is 01:30 UTC, i.e. 03:30 summer time.
        let r = resolve_recurring(date(2020, 3, 29), time(2, 30), &copenhagen()).unwrap();
        assert_eq!(r.utc.to_rfc3339(), "2020-03-29T01:30:00+00:00");
        assert_eq!(utc_offset_at(&copenhagen(), r.utc).unwrap(), 7200);
    }

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    fn time(h: u32, m: u32) -> Option<NaiveTime> {
        NaiveTime::from_hms_opt(h, m, 0)
    }

    fn copenhagen() -> ZoneChoice {
        ZoneChoice::Named("Europe/Copenhagen".into())
    }

    fn offset_hours(resolved: &ResolvedTime) -> f64 {
        resolved.offset_seconds as f64 / 3600.0
    }

    #[test]
    fn modern_winter_and_summer_time() {
        let winter = resolve(date(2020, 1, 15), time(9, 0), &copenhagen()).unwrap();
        assert_eq!(offset_hours(&winter), 1.0);
        assert_eq!(winter.utc.to_rfc3339(), "2020-01-15T08:00:00+00:00");

        let summer = resolve(date(2020, 7, 15), time(9, 0), &copenhagen()).unwrap();
        assert_eq!(offset_hours(&summer), 2.0);
    }

    #[test]
    fn no_summer_time_in_denmark_between_1949_and_1979() {
        let r = resolve(date(1965, 7, 1), time(12, 0), &copenhagen()).unwrap();
        assert_eq!(offset_hours(&r), 1.0);
    }

    /// Denmark's own summer time differed from Germany's after the war.
    /// These dates catch time zone data that has merged Copenhagen into Berlin.
    #[test]
    fn danish_post_war_summer_time_is_not_german() {
        // 20 April 1947: Germany was already on summer time, Denmark was
        // not (Danish summer time ran 4 May – 10 August 1947).
        let before = resolve(date(1947, 4, 20), time(12, 0), &copenhagen()).unwrap();
        assert_eq!(offset_hours(&before), 1.0);

        let during = resolve(date(1947, 6, 1), time(12, 0), &copenhagen()).unwrap();
        assert_eq!(offset_hours(&during), 2.0);

        // 1 September 1947: Germany still on summer time, Denmark back on standard time.
        let after = resolve(date(1947, 9, 1), time(12, 0), &copenhagen()).unwrap();
        assert_eq!(offset_hours(&after), 1.0);
    }

    #[test]
    fn sweden_had_no_summer_time_in_1947() {
        let zone = ZoneChoice::Named("Europe/Stockholm".into());
        let r = resolve(date(1947, 6, 1), time(12, 0), &zone).unwrap();
        assert_eq!(offset_hours(&r), 1.0);
    }

    #[test]
    fn local_mean_time_before_standard_time() {
        // Before 1890 Copenhagen kept local mean time, 50 min 20 s ahead of Greenwich.
        let r = resolve(date(1885, 5, 5), time(12, 0), &copenhagen()).unwrap();
        assert_eq!(r.offset_seconds, 50 * 60 + 20);
    }

    #[test]
    fn absurd_manual_offset_is_rejected() {
        let r = resolve(date(2000, 1, 1), None, &ZoneChoice::FixedOffset(20 * 3600));
        assert_eq!(r, Err(TimeError::InvalidOffset(20 * 3600)));
    }

    #[test]
    fn unknown_time_becomes_noon() {
        let r = resolve(date(1980, 3, 3), None, &copenhagen()).unwrap();
        assert!(r.time_assumed);
        assert_eq!(r.utc.to_rfc3339(), "1980-03-03T11:00:00+00:00");
    }

    #[test]
    fn manual_offset_overrides_zone_rules() {
        let r = resolve(date(1947, 4, 20), time(12, 0), &ZoneChoice::FixedOffset(3600)).unwrap();
        assert_eq!(r.utc.to_rfc3339(), "1947-04-20T11:00:00+00:00");
        assert!(!r.ambiguous);
    }

    #[test]
    fn repeated_hour_uses_first_occurrence_and_is_flagged() {
        // 25 October 2020, 02:30 happened twice in Copenhagen.
        let r = resolve(date(2020, 10, 25), time(2, 30), &copenhagen()).unwrap();
        assert!(r.ambiguous);
        assert_eq!(offset_hours(&r), 2.0);
    }

    #[test]
    fn skipped_hour_is_an_error() {
        // 29 March 2020, 02:30 never happened in Copenhagen.
        let r = resolve(date(2020, 3, 29), time(2, 30), &copenhagen());
        assert!(matches!(r, Err(TimeError::NonexistentLocalTime(_))));
    }

    #[test]
    fn unknown_zone_is_an_error() {
        let r = resolve(date(2020, 1, 1), None, &ZoneChoice::Named("Mars/Olympus".into()));
        assert!(matches!(r, Err(TimeError::UnknownZone(_))));
    }
}
