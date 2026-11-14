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
    version: "0.4.0",
    date: "2026-11-14",
    added: [
      "Live Chart: natalhoroskopet med transitterne for et valgt tidspunkt i en ydre ring. Åbnes med knappen “Live Chart” ved horoskopet.",
      "Tidsnavigation frem og tilbage i trin på 1 minut, 1 time, 1 dag, 1 uge eller 1 måned. Ét klik er ét trin, en holdt pil gentager, og en præcis dato og tid kan indtastes.",
      "Transit → natal og transit → transit som to aspektgrupper, der kan slås til og fra hver for sig og vises samtidig.",
      "Særskilt valg af, hvilke transitplaneter der vises i hjulet og indgår i aspekter, uafhængigt af valgene for natalplaneterne.",
      "Filtre for årets Time Lord, månedens Time Lord og planeter i årets profektionstegn. Filtrene kan kombineres.",
      "“Eksakt” ved et transitaspekt springer til det tidspunkt, hvor aspektet er eksakt. Ved flere passager på grund af retrograd bevægelse kan passagen vælges.",
      "Alder, årets Time Lord og månedens profektion vises i Live Chart og følger det viste tidspunkt.",
      "Livsbegivenheder for hvert horoskop med dato og eventuelt klokkeslæt, også når kun måned og år eller kun årstal kendes. Der gemmes kun det, der er kendt.",
      "Spring til en gemt livsbegivenhed i Live Chart. Er klokkeslættet ukendt, bruges kl. 12:00; mangler datoen, vælger du først en dato.",
      "Transithoroskop for nu eller et valgfrit tidspunkt under den nye fane “Transitter”.",
      "Indstilling for orb for transitaspekter (standard 7°).",
    ],
    changed: ["Horoskopvisningen har fået knappen “Live Chart” og et panel med livsbegivenheder."],
  },
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
