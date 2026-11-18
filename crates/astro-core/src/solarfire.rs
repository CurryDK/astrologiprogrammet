//! Reading chart files of Solar Fire (`.SFcht`), so an archive kept in that
//! program can be brought over.
//!
//! The format is not published; the layout below was worked out from files
//! written by Solar Fire ("version 3" in the file's first two bytes). All
//! numbers are little-endian and all text is Windows-1252, padded with spaces.
//!
//! ```text
//! file    u16 version (3) · title[80] · u32 chart count · charts
//! chart   2 bytes · moment · 2 bytes · rating[2] · source[30] · 142 bytes
//!         · u32 event count · events · u32 length · notes
//! event   moment · 1 byte · u32 length · note
//! moment  name[50] · place[20] · country[20]
//!         · f32 longitude (west positive) · f32 latitude (north positive)
//!         · i16 year · u8 month, day, hour, minute, second
//!         · f32 hours to add to reach UTC (west positive) · zone abbreviation[5]
//! ```
//!
//! The bytes not named hold settings of Solar Fire that have no counterpart
//! here and are skipped.

use std::collections::HashMap;

use chrono::{NaiveDate, NaiveDateTime};
use serde::Serialize;

use crate::ephemeris::{MAX_YEAR, MIN_YEAR};
use crate::places::PlaceIndex;
use crate::time::{ZoneChoice, local_time_at, resolve};

/// The only layout known; other versions are refused rather than guessed at.
const KNOWN_VERSION: u16 = 3;
/// Farthest a listed place may be from a chart's coordinates and still lend
/// it its time zone and country.
const NEAREST_PLACE_KM: f64 = 100.0;

/// A date, clock time and place as Solar Fire stores them.
#[derive(Debug, Clone, PartialEq)]
pub struct SfMoment {
    /// The chart's name, or the event's description.
    pub name: String,
    pub place: String,
    pub country: String,
    /// Degrees, north positive.
    pub latitude: f64,
    /// Degrees, east positive.
    pub longitude: f64,
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
    /// Offset of the clock time from UTC, in seconds east.
    pub offset_seconds: i32,
    /// E.g. `CET`; informational only.
    pub zone_abbreviation: String,
}

impl SfMoment {
    /// The local date and clock time, when the stored numbers name one.
    pub fn local(&self) -> Option<NaiveDateTime> {
        NaiveDate::from_ymd_opt(self.year, self.month, self.day)?
            .and_hms_opt(self.hour, self.minute, self.second)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SfEvent {
    pub moment: SfMoment,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SfChart {
    pub moment: SfMoment,
    /// Rodden rating of the birth time (`AA`, `A`, `B`, `C`, `DD`, `X`, `XX`), or empty.
    pub rating: String,
    pub source: String,
    pub notes: String,
    pub events: Vec<SfEvent>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SfFile {
    pub title: String,
    pub charts: Vec<SfChart>,
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

const TRUNCATED: &str = "filen slutter midt i et horoskop";

impl<'a> Reader<'a> {
    fn take(&mut self, length: usize) -> Result<&'a [u8], String> {
        let end = self.at.checked_add(length).filter(|end| *end <= self.bytes.len());
        let end = end.ok_or_else(|| TRUNCATED.to_string())?;
        let slice = &self.bytes[self.at..end];
        self.at = end;
        Ok(slice)
    }

    fn array<const N: usize>(&mut self) -> Result<[u8; N], String> {
        Ok(self.take(N)?.try_into().expect("take returns the length asked for"))
    }

    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.array()?))
    }

    fn f32(&mut self) -> Result<f32, String> {
        Ok(f32::from_le_bytes(self.array()?))
    }

    fn text(&mut self, length: usize) -> Result<String, String> {
        Ok(decode(self.take(length)?))
    }

    /// Text preceded by its length.
    fn long_text(&mut self) -> Result<String, String> {
        let length = self.u32()? as usize;
        Ok(self.text(length)?.replace("\r\n", "\n"))
    }

    fn moment(&mut self) -> Result<SfMoment, String> {
        let name = self.text(50)?;
        let place = self.text(20)?;
        let country = self.text(20)?;
        let west = self.f32()? as f64;
        let latitude = self.f32()? as f64;
        let year = i16::from_le_bytes(self.array()?) as i32;
        let [month, day, hour, minute, second] = self.array::<5>()?.map(u32::from);
        let hours_west = self.f32()? as f64;
        let zone_abbreviation = self.text(5)?;
        // The file's single precision leaves noise far below what was entered.
        let tidy = |degrees: f64| (degrees * 10_000.0).round() / 10_000.0;
        let offset = (-hours_west * 3600.0).round();
        Ok(SfMoment {
            name,
            place,
            country,
            latitude: tidy(latitude),
            longitude: tidy(-west),
            year,
            month,
            day,
            hour,
            minute,
            second,
            offset_seconds: if offset.is_finite() { offset as i32 } else { i32::MAX },
            zone_abbreviation,
        })
    }
}

/// Windows-1252 text without its padding.
fn decode(bytes: &[u8]) -> String {
    const HIGH: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž',
        '\u{8f}', '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}',
        'ž', 'Ÿ',
    ];
    let text: String = bytes
        .iter()
        .map(|&byte| match byte {
            0x80..=0x9f => HIGH[(byte - 0x80) as usize],
            _ => byte as char,
        })
        .collect();
    text.trim_matches(|c: char| c == ' ' || c == '\0').to_string()
}

/// Read a Solar Fire chart file.
pub fn parse(bytes: &[u8]) -> Result<SfFile, String> {
    let mut reader = Reader { bytes, at: 0 };
    let not_solar_fire = || "filen er ikke en Solar Fire-horoskopfil (.SFcht)".to_string();
    let version = u16::from_le_bytes(reader.array().map_err(|_| not_solar_fire())?);
    let title = reader.text(80).map_err(|_| not_solar_fire())?;
    let count = reader.u32().map_err(|_| not_solar_fire())?;
    if version != KNOWN_VERSION {
        return Err(format!(
            "filen er skrevet i et Solar Fire-format (version {version}), som programmet ikke kender"
        ));
    }

    let mut charts = Vec::new();
    for _ in 0..count {
        reader.take(2)?;
        let moment = reader.moment()?;
        reader.take(2)?;
        let rating = reader.text(2)?;
        let source = reader.text(30)?;
        reader.take(142)?;
        let event_count = reader.u32()?;
        let mut events = Vec::new();
        for _ in 0..event_count {
            let moment = reader.moment()?;
            reader.u8()?;
            let note = reader.long_text()?;
            events.push(SfEvent { moment, note });
        }
        let notes = reader.long_text()?;
        charts.push(SfChart { moment, rating, source, notes, events });
    }
    Ok(SfFile { title, charts })
}

/// A life event of a Solar Fire chart, as this program stores one.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedEvent {
    pub title: String,
    pub year: i32,
    pub month: u32,
    pub day: u32,
    /// `HH:MM`.
    pub time: String,
    /// IANA time zone the date and time are given in, when one was found.
    pub zone: Option<String>,
    pub note: String,
}

/// A Solar Fire chart, as this program stores one.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedChart {
    pub name: String,
    /// `YYYY-MM-DD`.
    pub birth_date: String,
    /// `HH:MM`; `None` when the file marks the time as unknown.
    pub birth_time: Option<String>,
    pub place_name: String,
    pub country_code: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
    /// IANA time zone of the nearest listed place, when there is one.
    pub zone: Option<String>,
    /// The file's offset from UTC, set only when the zone's own rules give
    /// another offset for the birth (or no zone was found), so the chart
    /// stays exactly as it was in Solar Fire.
    pub offset_seconds: Option<i32>,
    /// The offset the file gives, in seconds east of UTC.
    pub file_offset_seconds: i32,
    pub rating: String,
    pub events: Vec<ImportedEvent>,
    /// Events left out because their date is invalid or outside the ephemeris.
    pub events_skipped: usize,
    /// Why the chart cannot be imported; `None` when it can.
    pub problem: Option<String>,
}

const MAX_OFFSET_SECONDS: i32 = 16 * 3600;

/// Time zone and country of the listed place a moment happened at.
struct Located {
    zone: String,
    country_code: String,
}

struct Locator<'a> {
    places: &'a PlaceIndex,
    found: HashMap<(u64, u64, String), Option<(String, String)>>,
}

impl Locator<'_> {
    fn locate(&mut self, moment: &SfMoment) -> Option<Located> {
        let key = (moment.latitude.to_bits(), moment.longitude.to_bits(), moment.place.clone());
        let places = self.places;
        self.found
            .entry(key)
            .or_insert_with(|| {
                places
                    .nearest(moment.latitude, moment.longitude, &moment.place, NEAREST_PLACE_KM)
                    .map(|place| (place.zone.clone(), place.country_code.clone()))
            })
            .clone()
            .map(|(zone, country_code)| Located { zone, country_code })
    }
}

fn valid_place(moment: &SfMoment) -> bool {
    (-90.0..=90.0).contains(&moment.latitude)
        && (-180.0..=180.0).contains(&moment.longitude)
        && moment.offset_seconds.abs() <= MAX_OFFSET_SECONDS
}

fn in_ephemeris(moment: &SfMoment) -> bool {
    (MIN_YEAR..=MAX_YEAR).contains(&moment.year)
}

/// Turn the charts of a Solar Fire file into this program's form.
///
/// Solar Fire stores a fixed offset from UTC with every date; this program
/// stores a time zone and works the offset out. Each chart gets the zone of
/// the nearest listed place, and keeps the file's offset as a manual offset
/// only where the two disagree. A birth time is taken as unknown when the
/// file rates it `X` (time unknown) and the clock stands at 12:00:00, which
/// is what Solar Fire fills in. Seconds are dropped: times are kept to the
/// minute here.
pub fn convert(file: &SfFile, places: &PlaceIndex) -> Vec<ImportedChart> {
    let mut locator = Locator { places, found: HashMap::new() };
    file.charts.iter().map(|chart| convert_chart(chart, &mut locator)).collect()
}

fn convert_chart(chart: &SfChart, locator: &mut Locator<'_>) -> ImportedChart {
    let moment = &chart.moment;
    let local = moment.local();
    let problem = if local.is_none() {
        Some("datoen eller klokkeslættet er ugyldigt".to_string())
    } else if !in_ephemeris(moment) {
        Some(format!("årstallet {} er uden for programmets område", moment.year))
    } else if !valid_place(moment) {
        Some("koordinaterne eller tidszonen er ugyldige".to_string())
    } else {
        None
    };
    let located = if problem.is_none() { locator.locate(moment) } else { None };

    let time_unknown = chart.rating == "X" && (moment.hour, moment.minute, moment.second) == (12, 0, 0);
    let zone = located.as_ref().map(|l| l.zone.clone());
    let zone_agrees = match (&zone, local) {
        (Some(name), Some(local)) => resolve(local.date(), Some(local.time()), &ZoneChoice::Named(name.clone()))
            .is_ok_and(|resolved| resolved.offset_seconds == moment.offset_seconds),
        _ => false,
    };

    let mut events = Vec::new();
    let mut events_skipped = 0;
    for event in &chart.events {
        match convert_event(event, locator) {
            Some(event) => events.push(event),
            None => events_skipped += 1,
        }
    }

    ImportedChart {
        name: if moment.name.is_empty() { "Uden navn".to_string() } else { moment.name.clone() },
        birth_date: format!("{:04}-{:02}-{:02}", moment.year, moment.month, moment.day),
        birth_time: (!time_unknown).then(|| format!("{:02}:{:02}", moment.hour, moment.minute)),
        place_name: moment.place.clone(),
        country_code: located.map(|l| l.country_code),
        latitude: moment.latitude,
        longitude: moment.longitude,
        zone,
        offset_seconds: (!zone_agrees).then_some(moment.offset_seconds),
        file_offset_seconds: moment.offset_seconds,
        rating: chart.rating.clone(),
        events,
        events_skipped,
        problem,
    }
}

fn convert_event(event: &SfEvent, locator: &mut Locator<'_>) -> Option<ImportedEvent> {
    let moment = &event.moment;
    let local = moment.local()?;
    if !in_ephemeris(moment) || !valid_place(moment) {
        return None;
    }
    // The same instant, read on the clock of the zone it is stored with.
    let zone = locator.locate(moment).map(|l| l.zone);
    let shown = zone
        .as_ref()
        .and_then(|name| {
            let utc = (local - chrono::Duration::seconds(moment.offset_seconds as i64)).and_utc();
            local_time_at(&ZoneChoice::Named(name.clone()), utc).ok()
        })
        .filter(|shown| (MIN_YEAR..=MAX_YEAR).contains(&chrono::Datelike::year(shown)));
    let (zone, shown) = match shown {
        Some(shown) => (zone, shown),
        None => (None, local),
    };
    Some(ImportedEvent {
        title: if moment.name.is_empty() { "Uden titel".to_string() } else { moment.name.clone() },
        year: chrono::Datelike::year(&shown),
        month: chrono::Datelike::month(&shown),
        day: chrono::Datelike::day(&shown),
        time: shown.format("%H:%M").to_string(),
        zone,
        note: event.note.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn padded(text: &[u8], length: usize) -> Vec<u8> {
        let mut field = text.to_vec();
        field.resize(length, b' ');
        field
    }

    /// A moment in the file's layout. `west` and `hours_west` are as stored.
    #[allow(clippy::too_many_arguments)]
    fn moment(name: &[u8], place: &[u8], west: f32, north: f32, date: (i16, u8, u8), time: (u8, u8, u8), hours_west: f32, abbreviation: &[u8]) -> Vec<u8> {
        let mut bytes = padded(name, 50);
        bytes.extend(padded(place, 20));
        bytes.extend(padded(b"Denmark", 20));
        bytes.extend(west.to_le_bytes());
        bytes.extend(north.to_le_bytes());
        bytes.extend(date.0.to_le_bytes());
        bytes.extend([date.1, date.2, time.0, time.1, time.2]);
        bytes.extend(hours_west.to_le_bytes());
        bytes.extend(padded(abbreviation, 5));
        bytes
    }

    fn chart(moment: Vec<u8>, rating: &[u8], events: &[(Vec<u8>, &[u8])], notes: &[u8]) -> Vec<u8> {
        let mut bytes = vec![1, 1];
        bytes.extend(moment);
        bytes.extend([0, 2]);
        bytes.extend(padded(rating, 2));
        bytes.extend(padded(b"Hospital", 30));
        bytes.extend([0u8; 142]);
        bytes.extend((events.len() as u32).to_le_bytes());
        for (moment, note) in events {
            bytes.extend(moment);
            bytes.push(0);
            bytes.extend((note.len() as u32).to_le_bytes());
            bytes.extend(*note);
        }
        bytes.extend((notes.len() as u32).to_le_bytes());
        bytes.extend(notes);
        bytes
    }

    fn file(charts: &[Vec<u8>]) -> Vec<u8> {
        let mut bytes = 3u16.to_le_bytes().to_vec();
        bytes.extend(padded(b"Testfil", 80));
        bytes.extend((charts.len() as u32).to_le_bytes());
        for chart in charts {
            bytes.extend(chart);
        }
        bytes
    }

    const CPH: (f32, f32) = (-12.583_333, 55.666_668);

    fn sample() -> Vec<u8> {
        file(&[
            chart(
                // "Sørine" and "Hillerød" in Windows-1252.
                moment(b"S\xf8rine", b"Hiller\xf8d", -12.316_667, 55.933_334, (1967, 8, 20), (13, 15, 0), -1.0, b"CET"),
                b"AA",
                &[
                    (moment(b"Flyttede", b"Copenhagen", CPH.0, CPH.1, (1986, 9, 1), (10, 30, 0), -2.0, b"CEDT"), b"cirka"),
                    (moment(b"Separeret", b"Copenhagen", CPH.0, CPH.1, (2012, 6, 21), (10, 30, 0), 0.0, b"UT"), b""),
                ],
                b"Linje 1\r\nLinje 2",
            ),
            chart(moment(b"Ukendt tid", b"Copenhagen", CPH.0, CPH.1, (1948, 4, 1), (12, 0, 0), -1.0, b"CET"), b"X", &[], b""),
            chart(moment(b"Queens", b"Queens", 73.866_67, 40.716_667, (1946, 6, 14), (10, 54, 30), 4.0, b"EDT"), b"AA", &[], b""),
        ])
    }

    fn places() -> PlaceIndex {
        PlaceIndex::parse(
            "Copenhagen\tcopenhagen|kobenhavn\tDK\tCapital Region\t55.6759\t12.5655\tEurope/Copenhagen\t1153615\n\
             Hillerød\thillerod\tDK\tCapital Region\t55.9267\t12.3009\tEurope/Copenhagen\t28313\n\
             Malmö\tmalmo\tSE\tSkåne\t55.6059\t13.0007\tEurope/Stockholm\t301706\n",
        )
        .unwrap()
    }

    #[test]
    fn reads_charts_events_and_notes() {
        let parsed = parse(&sample()).unwrap();
        assert_eq!(parsed.title, "Testfil");
        assert_eq!(parsed.charts.len(), 3);

        let first = &parsed.charts[0];
        assert_eq!(first.moment.name, "Sørine");
        assert_eq!(first.moment.place, "Hillerød");
        assert_eq!(first.moment.country, "Denmark");
        assert_eq!((first.moment.latitude, first.moment.longitude), (55.9333, 12.3167));
        assert_eq!(first.moment.local().unwrap().to_string(), "1967-08-20 13:15:00");
        assert_eq!(first.moment.offset_seconds, 3600);
        assert_eq!(first.moment.zone_abbreviation, "CET");
        assert_eq!((first.rating.as_str(), first.source.as_str()), ("AA", "Hospital"));
        assert_eq!(first.notes, "Linje 1\nLinje 2");
        assert_eq!(first.events.len(), 2);
        assert_eq!(first.events[0].moment.name, "Flyttede");
        assert_eq!(first.events[0].note, "cirka");

        // West longitudes and offsets come out negative.
        let queens = &parsed.charts[2].moment;
        assert_eq!((queens.longitude, queens.offset_seconds), (-73.8667, -4 * 3600));
    }

    #[test]
    fn refuses_what_it_does_not_know() {
        assert!(parse(b"hej").is_err());
        let mut other_version = sample();
        other_version[0] = 4;
        assert!(parse(&other_version).unwrap_err().contains("version 4"));
        let whole = sample();
        assert!(parse(&whole[..whole.len() - 10]).is_err());
    }

    #[test]
    fn a_chart_gets_the_zone_of_its_place_and_keeps_an_offset_only_when_they_disagree() {
        let charts = convert(&parse(&sample()).unwrap(), &places());

        // Denmark had no summer time in 1967, so CET agrees with the zone.
        let first = &charts[0];
        assert_eq!(first.name, "Sørine");
        assert_eq!((first.birth_date.as_str(), first.birth_time.as_deref()), ("1967-08-20", Some("13:15")));
        assert_eq!(first.zone.as_deref(), Some("Europe/Copenhagen"));
        assert_eq!(first.country_code.as_deref(), Some("DK"));
        assert_eq!(first.offset_seconds, None);
        assert_eq!(first.problem, None);

        // No listed place within reach: the file's offset is all there is.
        let queens = &charts[2];
        assert_eq!(queens.zone, None);
        assert_eq!(queens.offset_seconds, Some(-4 * 3600));
        assert_eq!(queens.birth_time.as_deref(), Some("10:54"));
    }

    #[test]
    fn an_offset_the_zone_does_not_give_is_kept_as_a_manual_offset() {
        // Summer time entered for a date in winter.
        let bytes = file(&[chart(
            moment(b"Vinter", b"Copenhagen", CPH.0, CPH.1, (1990, 1, 10), (8, 0, 0), -2.0, b"CEDT"),
            b"A",
            &[],
            b"",
        )]);
        let charts = convert(&parse(&bytes).unwrap(), &places());
        assert_eq!(charts[0].zone.as_deref(), Some("Europe/Copenhagen"));
        assert_eq!(charts[0].offset_seconds, Some(7200));
    }

    #[test]
    fn noon_with_rating_x_is_an_unknown_birth_time() {
        let charts = convert(&parse(&sample()).unwrap(), &places());
        assert_eq!(charts[1].birth_time, None);
        assert_eq!(charts[1].rating, "X");
    }

    #[test]
    fn events_keep_their_instant_on_the_clock_of_their_zone() {
        let charts = convert(&parse(&sample()).unwrap(), &places());
        let events = &charts[0].events;
        assert_eq!((events[0].year, events[0].month, events[0].day), (1986, 9, 1));
        assert_eq!(events[0].time, "10:30");
        assert_eq!(events[0].zone.as_deref(), Some("Europe/Copenhagen"));
        assert_eq!(events[0].note, "cirka");
        // 10:30 UT is 12:30 in Copenhagen in June.
        assert_eq!(events[1].time, "12:30");
    }

    #[test]
    fn what_cannot_be_calculated_is_marked_or_left_out() {
        let bytes = file(&[
            chart(moment(b"For gammel", b"Copenhagen", CPH.0, CPH.1, (1500, 1, 1), (12, 0, 0), -1.0, b"CET"), b"", &[], b""),
            chart(
                moment(b"God", b"Copenhagen", CPH.0, CPH.1, (1990, 1, 1), (12, 0, 0), -1.0, b"CET"),
                b"",
                &[(moment(b"Umulig dato", b"Copenhagen", CPH.0, CPH.1, (1990, 2, 30), (12, 0, 0), -1.0, b"CET"), b"")],
                b"",
            ),
        ]);
        let charts = convert(&parse(&bytes).unwrap(), &places());
        assert!(charts[0].problem.is_some());
        assert_eq!(charts[1].problem, None);
        assert_eq!((charts[1].events.len(), charts[1].events_skipped), (0, 1));
        // Without rating X, noon is a real time.
        assert_eq!(charts[1].birth_time.as_deref(), Some("12:00"));
    }
}
