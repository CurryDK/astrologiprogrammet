//! Prints what the program would import from Solar Fire chart files, to
//! check a real file without touching the archive:
//!
//! ```text
//! cargo run -p astro-core --example solarfire_dump -- resources/places.tsv file.SFcht ...
//! ```

use astro_core::places::PlaceIndex;
use astro_core::solarfire::{convert, parse};

fn main() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let places = args.next().ok_or("usage: solarfire_dump <places.tsv> <file.SFcht> ...")?;
    let tsv = std::fs::read_to_string(&places).map_err(|e| format!("{places}: {e}"))?;
    let index = PlaceIndex::parse(&tsv)?;
    for path in args {
        let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
        let file = parse(&bytes)?;
        println!("== {path}: \"{}\", {} horoskoper", file.title, file.charts.len());
        for chart in convert(&file, &index) {
            let offset = match chart.offset_seconds {
                Some(seconds) => format!(" MANUAL OFFSET {seconds}"),
                None => String::new(),
            };
            println!(
                "{} | {} {} | {} [{}] {:.4} {:.4} | {}{} | rating {:?}{}{}",
                chart.name,
                chart.birth_date,
                chart.birth_time.as_deref().unwrap_or("ukendt tid"),
                chart.place_name,
                chart.country_code.as_deref().unwrap_or("?"),
                chart.latitude,
                chart.longitude,
                chart.zone.as_deref().unwrap_or("ingen zone"),
                offset,
                chart.rating,
                chart.problem.as_ref().map(|p| format!(" | PROBLEM: {p}")).unwrap_or_default(),
                if chart.events_skipped > 0 {
                    format!(" | {} begivenheder udeladt", chart.events_skipped)
                } else {
                    String::new()
                },
            );
            for event in &chart.events {
                println!(
                    "    {:04}-{:02}-{:02} {} {} | {} | {}",
                    event.year,
                    event.month,
                    event.day,
                    event.time,
                    event.zone.as_deref().unwrap_or("ingen zone"),
                    event.title,
                    event.note
                );
            }
        }
    }
    Ok(())
}
