//! Prints a computed chart as JSON, in the shape the app's `chart_compute`
//! command returns. Used to refresh `src/dev/fixture.json`, which lets the
//! interface be developed in a plain browser.
//!
//!   cargo run -p astro-core --example chart_json > src/dev/fixture.json

use std::path::PathBuf;

use astro_core::aspects::{Orbs, find_aspects};
use astro_core::chart::{Sect, compute_chart};
use astro_core::ephemeris;
use astro_core::lots::lot_report;
use astro_core::time::{ZoneChoice, resolve};
use chrono::{NaiveDate, NaiveTime};

fn main() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
    ephemeris::init(&dir).expect("ephemeris data files are present");

    // A chart with a tight cluster of planets, to exercise glyph spreading.
    let date = NaiveDate::from_ymd_opt(1962, 2, 4).unwrap();
    let time = NaiveTime::from_hms_opt(14, 20, 0);
    let zone = ZoneChoice::Named("Europe/Copenhagen".to_string());
    let resolved = resolve(date, time, &zone).expect("valid local time");

    let chart = compute_chart(resolved.utc, 55.6759, 12.5655).expect("chart computes");
    let aspects = find_aspects(&chart.aspect_points(), &Orbs::default());

    // Lot aspects with the app's defaults: 3° orb, exact below 1°.
    let lots = lot_report(&chart, None, 3.0, 1.0);
    // Not part of the command's reply: lets the stand-in backend show what
    // a manual sect change does. The fixture is a day chart.
    let lots_night = lot_report(&chart, Some(Sect::Night), 3.0, 1.0);

    let json = serde_json::json!({
        "chart": chart,
        "aspects": aspects,
        "time": resolved,
        "lots": lots,
        "devLotsNight": lots_night,
    });
    println!("{}", serde_json::to_string_pretty(&json).unwrap());
}
