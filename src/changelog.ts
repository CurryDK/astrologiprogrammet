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
    version: "0.3.0",
    date: "2026-11-14",
    added: [
      "Profektioner for natalhoroskoper: årlig profektion med 1. hus ved alder 0 og ét hus/tegn frem ved hver fødselsdag i en 12-årig cyklus.",
      "Årets Time Lord (tegnets traditionelle hersker) vises tydeligt øverst i profektionsoversigten.",
      "Månedlige profektioner: tiden mellem to fødselsdage deles i 12 præcist lige lange måneder, ikke 30-dages måneder.",
      "Profektionsoversigt med hver måneds start, slut, hus, tegn og hersker samt en tidslinje over alle 12 måneder, hvor den aktuelle måned er markeret.",
      "Navigation til forrige og næste profektionsår og tilbage til i dag.",
      "Indstillinger for profektioner: hvornår profektionsåret begynder (standard: fødselsdagen ved fødselsklokkeslættet), fødselsdag for fødte 29. februar (standard: 28. februar), og om klokkeslæt vises (standard: ja).",
    ],
    changed: ["Profektionerne står under hjulet i horoskopvisningen."],
  },
  {
    version: "0.2.2",
    date: "2026-11-14",
    added: ["Lots kan vises med sekunder; slås til under Indstillinger → Lots."],
    changed: [
      "Nye standardfarver for aspekter: sekstil pink (#FF1493), trigon grøn (#00A000), kvadrat rød (#E60000) og opposition orange (#FF8C00). Farver, du selv har valgt, bevares.",
      "Aspektlinjernes tykkelse går nu jævnt fra 4,5 px ved eksakt aspekt til 0,8 px ved den valgte maksimale orb.",
      "Lots vises afrundet til nærmeste minut i stedet for at blive skåret af. Beregningerne er uændrede og bruger fuld præcision.",
    ],
  },
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
