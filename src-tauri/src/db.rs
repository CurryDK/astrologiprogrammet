//! The user's data: saved charts, folders and settings, in one SQLite file
//! in the per-user app data folder. Updates never touch this file except
//! through the numbered migrations below.

use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};
use astro_core::chart::Sect;
use serde::{Deserialize, Serialize};

/// Applied in order; the database's `user_version` records how many have run.
/// Never edit an entry that has shipped — append a new one.
const MIGRATIONS: &[&str] = &[
    "CREATE TABLE folders (
        id   INTEGER PRIMARY KEY,
        name TEXT NOT NULL
     );
     CREATE TABLE charts (
        id             INTEGER PRIMARY KEY,
        name           TEXT NOT NULL,
        folder_id      INTEGER REFERENCES folders(id) ON DELETE SET NULL,
        birth_date     TEXT NOT NULL,
        birth_time     TEXT,
        place_name     TEXT NOT NULL,
        country_code   TEXT,
        latitude       REAL NOT NULL,
        longitude      REAL NOT NULL,
        zone           TEXT,
        offset_seconds INTEGER,
        featured       INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
     );
     CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
     );",
    // Manual day/night sect for the lots: NULL (use the Sun), 'day' or 'night'.
    "ALTER TABLE charts ADD COLUMN sect_override TEXT;",
    // Life events of a natal chart. Only what is known is stored: the year
    // always, then month, day and clock time as far as they are known.
    "CREATE TABLE life_events (
        id         INTEGER PRIMARY KEY,
        chart_id   INTEGER NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        year       INTEGER NOT NULL,
        month      INTEGER,
        day        INTEGER,
        time       TEXT,
        zone       TEXT,
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
     );",
];

/// Something that happened in the life of a chart's person.
///
/// The date is stored only as precisely as it is known (decision supplement
/// of 14 November 2026, point 4): a missing day or month is never filled in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifeEvent {
    /// `None` for an event that has not been saved yet.
    pub id: Option<i64>,
    pub chart_id: i64,
    pub title: String,
    pub year: i32,
    /// 1–12; `None` when only the year is known.
    pub month: Option<u32>,
    /// `None` when only the year, or month and year, are known.
    pub day: Option<u32>,
    /// `HH:MM` local clock time; `None` when unknown.
    pub time: Option<String>,
    /// IANA time zone the date and time are given in.
    pub zone: Option<String>,
    #[serde(default)]
    pub note: String,
}

impl LifeEvent {
    /// Checks that the parts fit together and name a real date and time.
    pub fn validate(&self) -> Result<(), String> {
        if self.title.trim().is_empty() {
            return Err("titel mangler".to_string());
        }
        if !(astro_core::ephemeris::MIN_YEAR..=astro_core::ephemeris::MAX_YEAR).contains(&self.year) {
            return Err(format!("årstallet {} er uden for programmets område", self.year));
        }
        match (self.month, self.day) {
            (None, Some(_)) => return Err("en dag kræver en måned".to_string()),
            (Some(month), None) if !(1..=12).contains(&month) => {
                return Err("ugyldig måned".to_string());
            }
            (Some(month), Some(day)) => {
                if chrono::NaiveDate::from_ymd_opt(self.year, month, day).is_none() {
                    return Err("datoen findes ikke".to_string());
                }
            }
            _ => {}
        }
        if let Some(time) = &self.time {
            if self.day.is_none() {
                return Err("et klokkeslæt kræver en dato".to_string());
            }
            if chrono::NaiveTime::parse_from_str(time, "%H:%M").is_err() {
                return Err(format!("ugyldigt klokkeslæt: {time}"));
            }
        }
        Ok(())
    }
}

const EVENT_COLUMNS: &str = "id, chart_id, title, year, month, day, time, zone, note";

fn event_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LifeEvent> {
    Ok(LifeEvent {
        id: Some(row.get(0)?),
        chart_id: row.get(1)?,
        title: row.get(2)?,
        year: row.get(3)?,
        month: row.get(4)?,
        day: row.get(5)?,
        time: row.get(6)?,
        zone: row.get(7)?,
        note: row.get(8)?,
    })
}

/// A chart's events in the order they happened, the less precise first
/// within the same year or month.
pub fn list_events(connection: &Connection, chart_id: i64) -> rusqlite::Result<Vec<LifeEvent>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {EVENT_COLUMNS} FROM life_events WHERE chart_id = ?1
         ORDER BY year, IFNULL(month, 0), IFNULL(day, 0), IFNULL(time, ''), id"
    ))?;
    let rows = statement.query_map([chart_id], event_from_row)?;
    rows.collect()
}

pub fn get_event(connection: &Connection, id: i64) -> rusqlite::Result<Option<LifeEvent>> {
    connection
        .query_row(
            &format!("SELECT {EVENT_COLUMNS} FROM life_events WHERE id = ?1"),
            [id],
            event_from_row,
        )
        .optional()
}

/// Insert a new event or update an existing one; returns its id.
pub fn save_event(connection: &Connection, event: &LifeEvent) -> rusqlite::Result<i64> {
    let values = params![
        event.chart_id,
        event.title.trim(),
        event.year,
        event.month,
        event.day,
        event.time,
        event.zone,
        event.note,
    ];
    match event.id {
        None => {
            connection.execute(
                "INSERT INTO life_events (chart_id, title, year, month, day, time, zone, note)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                values,
            )?;
            Ok(connection.last_insert_rowid())
        }
        Some(id) => {
            let changed = connection.execute(
                &format!(
                    "UPDATE life_events SET chart_id = ?1, title = ?2, year = ?3, month = ?4,
                         day = ?5, time = ?6, zone = ?7, note = ?8
                     WHERE id = {id}"
                ),
                values,
            )?;
            if changed == 0 {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
            Ok(id)
        }
    }
}

pub fn delete_event(connection: &Connection, id: i64) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM life_events WHERE id = ?1", [id])?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub name: String,
}

/// A saved natal chart: the birth data, not the computed positions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartRecord {
    /// `None` for a chart that has not been saved yet.
    pub id: Option<i64>,
    pub name: String,
    pub folder_id: Option<i64>,
    /// `YYYY-MM-DD`, local calendar date at the birthplace.
    pub birth_date: String,
    /// `HH:MM` local clock time; `None` when unknown.
    pub birth_time: Option<String>,
    pub place_name: String,
    pub country_code: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
    /// IANA time zone of the birthplace.
    pub zone: Option<String>,
    /// Manual UTC offset in seconds; overrides `zone` when set.
    pub offset_seconds: Option<i32>,
    /// Shown in the start screen's panel of selected charts.
    pub featured: bool,
    /// Manual day/night sect; `None` derives it from the Sun.
    #[serde(default)]
    pub sect_override: Option<Sect>,
}

fn sect_to_text(sect: Option<Sect>) -> Option<&'static str> {
    sect.map(|sect| match sect {
        Sect::Day => "day",
        Sect::Night => "night",
    })
}

fn sect_from_text(text: Option<String>) -> Option<Sect> {
    match text.as_deref() {
        Some("day") => Some(Sect::Day),
        Some("night") => Some(Sect::Night),
        _ => None,
    }
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let mut connection = Connection::open(path)?;
    prepare(&mut connection)?;
    Ok(connection)
}

fn prepare(connection: &mut Connection) -> rusqlite::Result<()> {
    connection.pragma_update(None, "foreign_keys", true)?;
    let applied: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    for (index, migration) in MIGRATIONS.iter().enumerate().skip(applied as usize) {
        let transaction = connection.transaction()?;
        transaction.execute_batch(migration)?;
        transaction.pragma_update(None, "user_version", index as i64 + 1)?;
        transaction.commit()?;
    }
    Ok(())
}

const CHART_COLUMNS: &str = "id, name, folder_id, birth_date, birth_time, place_name, \
     country_code, latitude, longitude, zone, offset_seconds, featured, sect_override";

fn chart_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChartRecord> {
    Ok(ChartRecord {
        id: Some(row.get(0)?),
        name: row.get(1)?,
        folder_id: row.get(2)?,
        birth_date: row.get(3)?,
        birth_time: row.get(4)?,
        place_name: row.get(5)?,
        country_code: row.get(6)?,
        latitude: row.get(7)?,
        longitude: row.get(8)?,
        zone: row.get(9)?,
        offset_seconds: row.get(10)?,
        featured: row.get(11)?,
        sect_override: sect_from_text(row.get(12)?),
    })
}

pub fn list_charts(connection: &Connection) -> rusqlite::Result<Vec<ChartRecord>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {CHART_COLUMNS} FROM charts ORDER BY name COLLATE NOCASE, id"
    ))?;
    let rows = statement.query_map([], chart_from_row)?;
    rows.collect()
}

pub fn get_chart(connection: &Connection, id: i64) -> rusqlite::Result<Option<ChartRecord>> {
    connection
        .query_row(
            &format!("SELECT {CHART_COLUMNS} FROM charts WHERE id = ?1"),
            [id],
            chart_from_row,
        )
        .optional()
}

/// Insert a new chart or update an existing one; returns its id.
pub fn save_chart(connection: &Connection, chart: &ChartRecord) -> rusqlite::Result<i64> {
    let values = params![
        chart.name,
        chart.folder_id,
        chart.birth_date,
        chart.birth_time,
        chart.place_name,
        chart.country_code,
        chart.latitude,
        chart.longitude,
        chart.zone,
        chart.offset_seconds,
        chart.featured,
        sect_to_text(chart.sect_override),
    ];
    match chart.id {
        None => {
            connection.execute(
                "INSERT INTO charts (name, folder_id, birth_date, birth_time, place_name,
                     country_code, latitude, longitude, zone, offset_seconds, featured,
                     sect_override)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                values,
            )?;
            Ok(connection.last_insert_rowid())
        }
        Some(id) => {
            let changed = connection.execute(
                &format!(
                    "UPDATE charts SET name = ?1, folder_id = ?2, birth_date = ?3,
                         birth_time = ?4, place_name = ?5, country_code = ?6, latitude = ?7,
                         longitude = ?8, zone = ?9, offset_seconds = ?10, featured = ?11,
                         sect_override = ?12, updated_at = CURRENT_TIMESTAMP
                     WHERE id = {id}"
                ),
                values,
            )?;
            if changed == 0 {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
            Ok(id)
        }
    }
}

pub fn delete_chart(connection: &Connection, id: i64) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM charts WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_folders(connection: &Connection) -> rusqlite::Result<Vec<Folder>> {
    let mut statement =
        connection.prepare("SELECT id, name FROM folders ORDER BY name COLLATE NOCASE, id")?;
    let rows = statement.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn create_folder(connection: &Connection, name: &str) -> rusqlite::Result<Folder> {
    connection.execute("INSERT INTO folders (name) VALUES (?1)", [name])?;
    Ok(Folder {
        id: connection.last_insert_rowid(),
        name: name.to_string(),
    })
}

pub fn rename_folder(connection: &Connection, id: i64, name: &str) -> rusqlite::Result<()> {
    connection.execute("UPDATE folders SET name = ?1 WHERE id = ?2", params![name, id])?;
    Ok(())
}

/// Deletes the folder only; its charts stay in the archive without a folder.
pub fn delete_folder(connection: &Connection, id: i64) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM folders WHERE id = ?1", [id])?;
    Ok(())
}

/// Saves charts with their life events (their `chart_id` is filled in here)
/// in a folder called `folder_name`, which is created unless one of that name
/// exists; an empty name means no folder. Everything is saved or nothing is.
/// Returns the folder's id.
pub fn import_charts(
    connection: &Connection,
    folder_name: &str,
    charts: &[(ChartRecord, Vec<LifeEvent>)],
) -> rusqlite::Result<Option<i64>> {
    let transaction = connection.unchecked_transaction()?;
    let folder_name = folder_name.trim();
    let folder_id = if folder_name.is_empty() {
        None
    } else {
        let existing: Option<i64> = transaction
            .query_row(
                "SELECT id FROM folders WHERE name = ?1 COLLATE NOCASE ORDER BY id LIMIT 1",
                [folder_name],
                |row| row.get(0),
            )
            .optional()?;
        Some(match existing {
            Some(id) => id,
            None => create_folder(&transaction, folder_name)?.id,
        })
    };
    for (chart, events) in charts {
        let chart_id = save_chart(&transaction, &ChartRecord { id: None, folder_id, ..chart.clone() })?;
        for event in events {
            save_event(&transaction, &LifeEvent { id: None, chart_id, ..event.clone() })?;
        }
    }
    transaction.commit()?;
    Ok(folder_id)
}

pub fn get_setting(connection: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    connection
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| row.get(0))
        .optional()
}

pub fn set_setting(connection: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        prepare(&mut connection).unwrap();
        connection
    }

    fn sample(name: &str) -> ChartRecord {
        ChartRecord {
            id: None,
            name: name.to_string(),
            folder_id: None,
            birth_date: "1950-06-15".to_string(),
            birth_time: Some("08:30".to_string()),
            place_name: "Copenhagen".to_string(),
            country_code: Some("DK".to_string()),
            latitude: 55.6759,
            longitude: 12.5655,
            zone: Some("Europe/Copenhagen".to_string()),
            offset_seconds: None,
            featured: false,
            sect_override: None,
        }
    }

    fn event(chart_id: i64, title: &str, year: i32, month: Option<u32>, day: Option<u32>) -> LifeEvent {
        LifeEvent {
            id: None,
            chart_id,
            title: title.to_string(),
            year,
            month,
            day,
            time: None,
            zone: Some("Europe/Copenhagen".to_string()),
            note: String::new(),
        }
    }

    #[test]
    fn life_events_keep_only_what_is_known_and_come_back_in_order() {
        let db = memory();
        let chart = save_chart(&db, &sample("Anna")).unwrap();
        let other = save_chart(&db, &sample("Bo")).unwrap();

        let mut wedding = event(chart, "Bryllup", 1975, Some(6), Some(14));
        wedding.time = Some("14:00".to_string());
        let wedding_id = save_event(&db, &wedding).unwrap();
        save_event(&db, &event(chart, "Flyttede", 1975, None, None)).unwrap();
        save_event(&db, &event(chart, "Nyt job", 1975, Some(6), None)).unwrap();
        save_event(&db, &event(chart, "Skolestart", 1957, Some(8), Some(12))).unwrap();
        save_event(&db, &event(other, "Andet kort", 1960, None, None)).unwrap();

        let events = list_events(&db, chart).unwrap();
        let titles: Vec<&str> = events.iter().map(|e| e.title.as_str()).collect();
        assert_eq!(titles, ["Skolestart", "Flyttede", "Nyt job", "Bryllup"]);
        // Nothing was invented for the imprecise ones.
        assert_eq!((events[1].month, events[1].day, events[1].time.clone()), (None, None, None));
        assert_eq!((events[2].month, events[2].day), (Some(6), None));
        assert_eq!(events[3].time.as_deref(), Some("14:00"));

        let mut changed = get_event(&db, wedding_id).unwrap().unwrap();
        changed.time = None;
        changed.note = "Rådhuset".to_string();
        assert_eq!(save_event(&db, &changed).unwrap(), wedding_id);
        assert_eq!(get_event(&db, wedding_id).unwrap().unwrap(), changed);

        delete_event(&db, wedding_id).unwrap();
        assert_eq!(list_events(&db, chart).unwrap().len(), 3);
    }

    #[test]
    fn deleting_a_chart_deletes_its_life_events() {
        let db = memory();
        let chart = save_chart(&db, &sample("Anna")).unwrap();
        let id = save_event(&db, &event(chart, "Bryllup", 1975, Some(6), Some(14))).unwrap();
        delete_chart(&db, chart).unwrap();
        assert!(get_event(&db, id).unwrap().is_none());
    }

    #[test]
    fn life_events_are_checked_before_saving() {
        let ok = event(1, "Bryllup", 1975, Some(6), Some(14));
        assert!(ok.validate().is_ok());
        assert!(event(1, "  ", 1975, None, None).validate().is_err());
        assert!(event(1, "x", 1975, None, Some(3)).validate().is_err());
        assert!(event(1, "x", 1975, Some(13), None).validate().is_err());
        assert!(event(1, "x", 1975, Some(2), Some(29)).validate().is_err());
        assert!(event(1, "x", 1976, Some(2), Some(29)).validate().is_ok());
        assert!(event(1, "x", 1492, None, None).validate().is_err());
        let timed = LifeEvent { time: Some("14:00".to_string()), ..event(1, "x", 1975, Some(6), None) };
        assert!(timed.validate().is_err());
        let bad_time = LifeEvent { time: Some("25:00".to_string()), ..ok.clone() };
        assert!(bad_time.validate().is_err());
    }

    #[test]
    fn a_database_from_before_life_events_is_upgraded_and_keeps_its_charts() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(MIGRATIONS[0]).unwrap();
        db.execute_batch(MIGRATIONS[1]).unwrap();
        db.pragma_update(None, "user_version", 2).unwrap();
        db.pragma_update(None, "foreign_keys", true).unwrap();
        let chart = save_chart(&db, &sample("Anna")).unwrap();

        prepare(&mut db).unwrap();
        assert_eq!(get_chart(&db, chart).unwrap().unwrap().name, "Anna");
        save_event(&db, &event(chart, "Bryllup", 1975, None, None)).unwrap();
        assert_eq!(list_events(&db, chart).unwrap().len(), 1);
    }

    #[test]
    fn saves_reads_updates_and_deletes_a_chart() {
        let db = memory();
        let id = save_chart(&db, &sample("Anna")).unwrap();

        let mut stored = get_chart(&db, id).unwrap().unwrap();
        assert_eq!(stored.name, "Anna");
        assert_eq!(stored.birth_time.as_deref(), Some("08:30"));

        stored.name = "Anna B.".to_string();
        stored.birth_time = None;
        stored.featured = true;
        assert_eq!(save_chart(&db, &stored).unwrap(), id);
        let updated = get_chart(&db, id).unwrap().unwrap();
        assert_eq!(updated, stored);

        delete_chart(&db, id).unwrap();
        assert!(get_chart(&db, id).unwrap().is_none());
    }

    #[test]
    fn sect_override_is_stored_per_chart_and_can_be_cleared() {
        let db = memory();
        let id = save_chart(&db, &sample("Anna")).unwrap();
        let other = save_chart(&db, &sample("Bo")).unwrap();

        let mut chart = get_chart(&db, id).unwrap().unwrap();
        assert_eq!(chart.sect_override, None);
        chart.sect_override = Some(Sect::Night);
        save_chart(&db, &chart).unwrap();
        assert_eq!(get_chart(&db, id).unwrap().unwrap().sect_override, Some(Sect::Night));
        assert_eq!(get_chart(&db, other).unwrap().unwrap().sect_override, None);

        chart.sect_override = None;
        save_chart(&db, &chart).unwrap();
        assert_eq!(get_chart(&db, id).unwrap().unwrap().sect_override, None);
    }

    #[test]
    fn a_database_from_the_first_release_is_upgraded_in_place() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(MIGRATIONS[0]).unwrap();
        db.pragma_update(None, "user_version", 1).unwrap();
        db.execute(
            "INSERT INTO charts (name, birth_date, place_name, latitude, longitude)
             VALUES ('Gammel', '1950-06-15', 'Aarhus', 56.0, 10.0)",
            [],
        )
        .unwrap();

        prepare(&mut db).unwrap();
        let charts = list_charts(&db).unwrap();
        assert_eq!(charts.len(), 1);
        assert_eq!(charts[0].name, "Gammel");
        assert_eq!(charts[0].sect_override, None);
    }

    #[test]
    fn a_saved_chart_without_the_field_reads_as_no_override() {
        let json = r#"{"id":null,"name":"x","folderId":null,"birthDate":"1950-06-15",
            "birthTime":null,"placeName":"y","countryCode":null,"latitude":1.0,
            "longitude":2.0,"zone":null,"offsetSeconds":null,"featured":false}"#;
        let chart: ChartRecord = serde_json::from_str(json).unwrap();
        assert_eq!(chart.sect_override, None);
    }

    #[test]
    fn updating_a_missing_chart_is_an_error() {
        let db = memory();
        let mut ghost = sample("Ghost");
        ghost.id = Some(999);
        assert!(save_chart(&db, &ghost).is_err());
    }

    #[test]
    fn charts_are_listed_by_name_ignoring_case() {
        let db = memory();
        for name in ["bo", "Anna", "Carl"] {
            save_chart(&db, &sample(name)).unwrap();
        }
        let names: Vec<_> = list_charts(&db).unwrap().into_iter().map(|c| c.name).collect();
        assert_eq!(names, ["Anna", "bo", "Carl"]);
    }

    #[test]
    fn deleting_a_folder_keeps_its_charts() {
        let db = memory();
        let folder = create_folder(&db, "Familie").unwrap();
        let mut chart = sample("Anna");
        chart.folder_id = Some(folder.id);
        let id = save_chart(&db, &chart).unwrap();

        rename_folder(&db, folder.id, "Familien").unwrap();
        assert_eq!(list_folders(&db).unwrap()[0].name, "Familien");

        delete_folder(&db, folder.id).unwrap();
        assert!(list_folders(&db).unwrap().is_empty());
        assert_eq!(get_chart(&db, id).unwrap().unwrap().folder_id, None);
    }

    #[test]
    fn imported_charts_land_in_one_folder_with_their_events() {
        let db = memory();
        let batch = vec![
            (sample("Anna"), vec![event(0, "Bryllup", 1975, Some(6), Some(14))]),
            (sample("Bo"), vec![]),
        ];
        let folder = import_charts(&db, " Familie ", &batch).unwrap().unwrap();
        // A second file into the same folder name reuses the folder.
        assert_eq!(import_charts(&db, "familie", &[(sample("Carl"), vec![])]).unwrap(), Some(folder));
        assert_eq!(import_charts(&db, "", &[(sample("Dea"), vec![])]).unwrap(), None);

        assert_eq!(list_folders(&db).unwrap().len(), 1);
        let charts = list_charts(&db).unwrap();
        let folders: Vec<_> = charts.iter().map(|c| (c.name.as_str(), c.folder_id)).collect();
        assert_eq!(
            folders,
            [("Anna", Some(folder)), ("Bo", Some(folder)), ("Carl", Some(folder)), ("Dea", None)]
        );
        let events = list_events(&db, charts[0].id.unwrap()).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Bryllup");
    }

    #[test]
    fn a_failed_import_saves_nothing() {
        let db = memory();
        db.execute_batch(
            "CREATE TRIGGER refuse BEFORE INSERT ON life_events
             BEGIN SELECT RAISE(ABORT, 'nej'); END;",
        )
        .unwrap();
        let batch = vec![(sample("Anna"), vec![event(0, "Bryllup", 1975, None, None)])];
        assert!(import_charts(&db, "Familie", &batch).is_err());
        assert!(list_charts(&db).unwrap().is_empty());
        assert!(list_folders(&db).unwrap().is_empty());
    }

    #[test]
    fn settings_are_overwritten_by_key() {
        let db = memory();
        assert_eq!(get_setting(&db, "ui").unwrap(), None);
        set_setting(&db, "ui", "{\"a\":1}").unwrap();
        set_setting(&db, "ui", "{\"a\":2}").unwrap();
        assert_eq!(get_setting(&db, "ui").unwrap().as_deref(), Some("{\"a\":2}"));
    }

    #[test]
    fn reopening_does_not_rerun_migrations() {
        let dir = std::env::temp_dir().join(format!("astro-db-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.db");
        let _ = std::fs::remove_file(&path);
        {
            let db = open(&path).unwrap();
            save_chart(&db, &sample("Anna")).unwrap();
        }
        let db = open(&path).unwrap();
        assert_eq!(list_charts(&db).unwrap().len(), 1);
        drop(db);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
