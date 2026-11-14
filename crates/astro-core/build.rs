//! Compiles the vendored Swiss Ephemeris C sources (v2.10.03) into a static library.

const DIR: &str = "vendor/swisseph";
const SOURCES: [&str; 9] = [
    "swecl.c",
    "swedate.c",
    "swehel.c",
    "swehouse.c",
    "swejpl.c",
    "swemmoon.c",
    "swemplan.c",
    "sweph.c",
    "swephlib.c",
];

fn main() {
    let mut build = cc::Build::new();
    for source in SOURCES {
        build.file(format!("{DIR}/{source}"));
    }
    build
        .include(DIR)
        .define("_CRT_SECURE_NO_WARNINGS", None)
        .warnings(false)
        .compile("swisseph");
    println!("cargo:rerun-if-changed={DIR}");
}
