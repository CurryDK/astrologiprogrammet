//! Offline place lookup over the bundled GeoNames list (`resources/places.tsv`).

use serde::Serialize;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub name: String,
    /// ISO 3166 two-letter code.
    pub country_code: String,
    /// First-level administrative region; may be empty.
    pub region: String,
    /// Degrees, north positive.
    pub latitude: f64,
    /// Degrees, east positive.
    pub longitude: f64,
    /// IANA time zone name.
    pub zone: String,
    pub population: u64,
}

pub struct PlaceIndex {
    /// Sorted by population, largest first.
    places: Vec<Place>,
    /// Folded search names for each place, `|` separated.
    keys: Vec<String>,
}

impl PlaceIndex {
    /// Parse the file written by `scripts/build-places.mjs`.
    pub fn parse(tsv: &str) -> Result<PlaceIndex, String> {
        let mut places = Vec::new();
        let mut keys = Vec::new();
        for (number, line) in tsv.lines().enumerate() {
            if line.is_empty() {
                continue;
            }
            let fields: Vec<&str> = line.split('\t').collect();
            let bad = || format!("places file, line {}: unexpected format", number + 1);
            if fields.len() != 8 {
                return Err(bad());
            }
            places.push(Place {
                name: fields[0].to_string(),
                country_code: fields[2].to_string(),
                region: fields[3].to_string(),
                latitude: fields[4].parse().map_err(|_| bad())?,
                longitude: fields[5].parse().map_err(|_| bad())?,
                zone: fields[6].to_string(),
                population: fields[7].parse().map_err(|_| bad())?,
            });
            keys.push(fields[1].to_string());
        }
        Ok(PlaceIndex { places, keys })
    }

    pub fn len(&self) -> usize {
        self.places.len()
    }

    pub fn is_empty(&self) -> bool {
        self.places.is_empty()
    }

    pub fn places(&self) -> &[Place] {
        &self.places
    }

    /// Places whose name matches the query: exact matches first, then names
    /// starting with it, then names containing it; larger places first
    /// within each group. Accents and case are ignored, so "kobenhavn"
    /// finds København.
    pub fn search(&self, query: &str, limit: usize) -> Vec<&Place> {
        let query = fold(query);
        if query.is_empty() {
            return Vec::new();
        }
        // Substring matches on one or two letters are noise.
        let allow_contains = query.chars().count() >= 3;

        let mut exact = Vec::new();
        let mut prefix = Vec::new();
        let mut contains = Vec::new();
        for (index, keys) in self.keys.iter().enumerate() {
            let mut best = None;
            for key in keys.split('|') {
                let rank = if key == query {
                    0
                } else if key.starts_with(&query) {
                    1
                } else if allow_contains && key.contains(&query) {
                    2
                } else {
                    continue;
                };
                best = Some(best.map_or(rank, |b: u8| b.min(rank)));
            }
            match best {
                Some(0) => exact.push(index),
                Some(1) if prefix.len() < limit => prefix.push(index),
                Some(2) if contains.len() < limit => contains.push(index),
                _ => {}
            }
        }
        exact
            .into_iter()
            .chain(prefix)
            .chain(contains)
            .take(limit)
            .map(|index| &self.places[index])
            .collect()
    }

    /// The listed place that coordinates given without a time zone most
    /// likely belong to: within `max_km`, the nearest place called `name`,
    /// or, when none is, the nearest place.
    pub fn nearest(&self, latitude: f64, longitude: f64, name: &str, max_km: f64) -> Option<&Place> {
        const KM_PER_DEGREE: f64 = 111.195;
        let name = fold(name);
        let east_scale = latitude.to_radians().cos();
        let mut best: Option<(bool, f64, usize)> = None;
        for (index, place) in self.places.iter().enumerate() {
            let north = place.latitude - latitude;
            if north.abs() * KM_PER_DEGREE > max_km {
                continue;
            }
            // Across the date line the short way round.
            let east = ((place.longitude - longitude + 540.0).rem_euclid(360.0) - 180.0) * east_scale;
            let km = north.hypot(east) * KM_PER_DEGREE;
            if km > max_km {
                continue;
            }
            let named = !name.is_empty() && self.keys[index].split('|').any(|key| key == name);
            let better = match best {
                None => true,
                Some((best_named, best_km, _)) => (named, -km) > (best_named, -best_km),
            };
            if better {
                best = Some((named, km, index));
            }
        }
        best.map(|(_, _, index)| &self.places[index])
    }
}

/// Lower-case, strip accents and punctuation. Must match `fold` in
/// `scripts/build-places.mjs`.
pub fn fold(text: &str) -> String {
    let mut folded = String::with_capacity(text.len());
    for c in text.to_lowercase().nfd() {
        if is_combining_mark(c) {
            continue;
        }
        match c {
            'æ' => folded.push_str("ae"),
            'ø' => folded.push('o'),
            'ß' => folded.push_str("ss"),
            'đ' | 'ð' => folded.push('d'),
            'ł' => folded.push('l'),
            'œ' => folded.push_str("oe"),
            'þ' => folded.push_str("th"),
            'ı' => folded.push('i'),
            '\'' | '’' => {}
            c if c.is_whitespace() || c == '.' || c == '-' => {
                if !folded.ends_with(' ') {
                    folded.push(' ');
                }
            }
            c => folded.push(c),
        }
    }
    folded.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folding_ignores_case_accents_and_punctuation() {
        assert_eq!(fold("København"), "kobenhavn");
        assert_eq!(fold("  Århus "), "arhus");
        assert_eq!(fold("Ærøskøbing"), "aeroskobing");
        assert_eq!(fold("Saint-Étienne"), "saint etienne");
        assert_eq!(fold("St. John's"), "st johns");
        assert_eq!(fold("Łódź"), "lodz");
    }

    fn index() -> PlaceIndex {
        let tsv = "\
Copenhagen\tcopenhagen|kobenhavn\tDK\tCapital Region\t55.6759\t12.5655\tEurope/Copenhagen\t1153615
Aarhus\taarhus|arhus\tDK\tCentral Jutland\t56.1567\t10.2108\tEurope/Copenhagen\t285273
Aars\taars\tDK\tNorth Denmark\t56.8040\t9.5144\tEurope/Copenhagen\t8474
Paris\tparis\tFR\tÎle-de-France\t48.8534\t2.3488\tEurope/Paris\t2138551
Paris\tparis\tUS\tTexas\t33.6609\t-95.5555\tAmerica/Chicago\t24782
";
        PlaceIndex::parse(tsv).unwrap()
    }

    #[test]
    fn finds_a_city_by_its_local_name() {
        let index = index();
        let found = index.search("københavn", 10);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Copenhagen");
        assert_eq!(found[0].zone, "Europe/Copenhagen");
    }

    #[test]
    fn exact_match_comes_before_prefix_match() {
        let index = index();
        let names: Vec<_> = index.search("aars", 10).iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["Aars"]);
        let names: Vec<_> = index.search("aa", 10).iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["Aarhus", "Aars"]);
    }

    #[test]
    fn same_name_is_ordered_by_population() {
        let index = index();
        let countries: Vec<_> =
            index.search("Paris", 10).iter().map(|p| p.country_code.as_str()).collect();
        assert_eq!(countries, ["FR", "US"]);
    }

    #[test]
    fn substring_needs_three_letters() {
        let index = index();
        assert!(index.search("hu", 10).is_empty());
        assert_eq!(index.search("hus", 10)[0].name, "Aarhus");
    }

    #[test]
    fn empty_query_and_limit() {
        let index = index();
        assert!(index.search("  ", 10).is_empty());
        assert_eq!(index.search("paris", 1).len(), 1);
    }

    #[test]
    fn nearest_prefers_the_named_place_and_respects_the_distance() {
        let index = index();
        // Between Aarhus and Aars, a little closer to Aarhus.
        assert_eq!(index.nearest(56.4, 10.0, "", 100.0).unwrap().name, "Aarhus");
        assert_eq!(index.nearest(56.4, 10.0, "Aars", 100.0).unwrap().name, "Aars");
        assert_eq!(index.nearest(56.4, 10.0, "Ukendt", 100.0).unwrap().name, "Aarhus");
        assert!(index.nearest(56.4, 10.0, "Paris", 20.0).is_none());
        assert_eq!(index.nearest(33.7, -95.5, "paris", 100.0).unwrap().country_code, "US");
    }

    #[test]
    fn malformed_file_is_rejected() {
        assert!(PlaceIndex::parse("only\tthree\tfields\n").is_err());
    }
}
