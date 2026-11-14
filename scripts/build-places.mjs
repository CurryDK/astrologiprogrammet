// Builds resources/places.tsv from GeoNames data (https://www.geonames.org, CC BY 4.0).
//
// Usage:
//   node scripts/build-places.mjs <folder with cities1000.txt and admin1CodesASCII.txt>
//
// Both input files come from https://download.geonames.org/export/dump/
// (cities1000.zip and admin1CodesASCII.txt). Re-run this when the place list
// should be refreshed; the output is committed.
//
// Output columns (tab separated, largest population first):
//   name, search keys (folded, '|' separated), country code, region,
//   latitude, longitude, IANA time zone, population

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error("Usage: node scripts/build-places.mjs <geonames folder>");
  process.exit(1);
}

/** Alternate names are only kept for larger cities, where the local and
 *  the international name often differ (København / Copenhagen). */
const ALTERNATE_NAMES_MIN_POPULATION = 15000;
const LATIN_NAME = /^[\p{Script=Latin}\p{M}\s'’.\-]+$/u;

const SPECIAL_LETTERS = {
  æ: "ae", ø: "o", ß: "ss", đ: "d", ð: "d", ł: "l", œ: "oe", þ: "th", ı: "i",
};

/** Must match `fold` in crates/astro-core/src/places.rs. */
function fold(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[æøßđðłœþı]/g, (c) => SPECIAL_LETTERS[c])
    .replace(/[’']/g, "")
    .replace(/[\s.\-]+/g, " ")
    .trim();
}

const regions = new Map(
  readFileSync(join(sourceDir, "admin1CodesASCII.txt"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, name] = line.split("\t");
      return [code, name];
    }),
);

const rows = [];
for (const line of readFileSync(join(sourceDir, "cities1000.txt"), "utf8").split("\n")) {
  if (!line) continue;
  const f = line.split("\t");
  const name = f[1];
  const population = Number(f[14]);
  const zone = f[17];
  if (!name || !zone) continue;

  const keys = new Set([fold(name), fold(f[2])]);
  if (population >= ALTERNATE_NAMES_MIN_POPULATION) {
    for (const alternate of f[3].split(",")) {
      // Skip airport-style codes and names in other scripts.
      if (alternate.length < 3 || /^[A-Z]{3,4}$/.test(alternate)) continue;
      if (LATIN_NAME.test(alternate)) keys.add(fold(alternate));
    }
  }
  keys.delete("");

  rows.push({
    population,
    line: [
      name,
      [...keys].join("|"),
      f[8],
      regions.get(`${f[8]}.${f[10]}`) ?? "",
      Number(f[4]).toFixed(4),
      Number(f[5]).toFixed(4),
      zone,
      population,
    ].join("\t"),
  });
}

rows.sort((a, b) => b.population - a.population);
const output = rows.map((row) => row.line).join("\n") + "\n";
writeFileSync(join("resources", "places.tsv"), output);
console.log(`${rows.length} places, ${(output.length / 1e6).toFixed(1)} MB`);
