// What each released version added and changed, newest first, in Danish.
// Shown in the app when the version number in the top bar is pressed.
// Add an entry here with every release (a test checks the newest entry
// matches the version in package.json).

export type ChangelogEntry = {
  version: string;
  /** `YYYY-MM-DD`. */
  date: string;
  added: string[];
  changed: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.1",
    date: "2026-11-14",
    added: ["Ændringslog: en oversigt over, hvad hver version har tilføjet og ændret."],
    changed: ["Versionsnummeret øverst til højre kan nu trykkes og åbner ændringsloggen."],
  },
  {
    version: "0.2.0",
    date: "2026-11-14",
    added: [
      "De syv hermetiske lots: Fortune, Spirit, Eros, Necessity, Courage, Victory og Nemesis.",
      "Lots-oversigt med position, hus, traditionel planet, tegnhersker samt herskerens tegn og hus.",
      "Lot-aspekter i en særskilt oversigt med orb, “e” for eksakt og “oos” for out of sign.",
      "Lots i hjulet med midlertidige symboler og monokrome positionsstreger; hvert lot kan slås til og fra under “Visning”.",
      "Manuelt valg af dag- eller natkort for det enkelte horoskop; alle syv lots genberegnes.",
      "Indstillinger for lots: orb for lot-aspekter (standard 3°) og grænsen for “eksakt” (standard 1°).",
    ],
    changed: ["Horoskopets overskrift viser, når dag-/natkort er valgt manuelt."],
  },
  {
    version: "0.1.0",
    date: "2026-11-14",
    added: [
      "Natalhoroskop med horoskophjul, positioner og heltegnshuse.",
      "Fødselsformular med stedsøgning og tidszoner, også for ældre fødsler.",
      "Arkiv med søgning og egne mapper.",
      "Aspektoversigt med orb, applicerende/separerende og out of sign.",
      "Indstillinger for farver og orber, som huskes.",
      "Startskærm med “Himlen lige nu” og udvalgte horoskoper.",
    ],
    changed: [],
  },
  {
    version: "0.0.2",
    date: "2026-11-14",
    added: [
      "Beregningskerne: planetpositioner, akser, heltegnshuse, dag-/natkort og tidszoner.",
    ],
    changed: [],
  },
  {
    version: "0.0.1",
    date: "2026-11-14",
    added: ["Første version: programmet kan installeres og opdaterer sig selv."],
    changed: [],
  },
];
