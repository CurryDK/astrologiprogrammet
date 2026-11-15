// Danish texts for Planetary Condition: the matrix rows, the rule and source
// shown when a condition is pressed, and the short reason of each condition.
// Nothing here decides anything; the rules live in the Rust core.

import {
  ASPECT_NAMES,
  POINT_NAMES,
  formatOrb,
  type AngleName,
  type Condition,
  type ConditionGroup,
  type ConditionKind,
  type Dignity,
  type Rating,
} from "./astro";

export const GROUP_NAMES: Record<ConditionGroup, string> = {
  sect: "Sect",
  joys: "Joys",
  dignities: "Essential dignities",
  sun: "Forhold til Solen",
  houses: "Huse og vinkler",
  copresence: "Co-presence",
  domicileLord: "Domicile lord",
  reception: "Reception",
  overcoming: "Overcoming",
  bonification: "Bonification",
  maltreatment: "Maltreatment",
};

export const RATING_NAMES: Record<Rating, string> = {
  verySupportive: "Meget understøttende",
  supportive: "Understøttende",
  challenging: "Udfordrende",
  veryChallenging: "Meget udfordrende",
};

export const SPEED_NAMES = { retro: "Retro", slow: "Slow", fast: "Fast" } as const;

export const DIGNITY_NAMES: Record<Dignity, string> = {
  domicile: "domicil",
  exaltation: "eksaltation",
  triplicity: "triplicitet",
  bounds: "bounds",
  decan: "decan",
};

const ANGLE_NAMES: Record<AngleName, string> = {
  ascendant: "ASC",
  descendant: "DSC",
  midheaven: "MC",
  imumCoeli: "IC",
};

const BASIS = "Planetary Condition – beslutningsgrundlag, 14. november 2026";
const SUPPLEMENT = "Endeligt beslutningstillæg, 14. november 2026";
const ANSWERS = "Svar på de 11 spørgsmål, 15. november 2026";
const DECISIONS = "13 implementeringsbeslutninger, 15. november 2026";

export type ConditionRow = {
  group: ConditionGroup;
  kind: ConditionKind;
  label: string;
  /** The rule applied, in a sentence or two. */
  rule: string;
  source: string;
};

const row = (
  group: ConditionGroup,
  kind: ConditionKind,
  label: string,
  rule: string,
  source: string,
): ConditionRow => ({ group, kind, label, rule, source });

const CLOSE =
  "inden for 3° (13° når Månen indgår), grænsen medregnet. Et eksakt aspekt tæller med; et separerende gør ikke";

/** Every row of the matrix, in display order. */
export const CONDITION_ROWS: ConditionRow[] = [
  row("sect", "sectLight", "Sect light", "Solen er sect light i et dagkort, Månen i et natkort.", BASIS),
  row(
    "sect",
    "sectFavored",
    "Favored sect",
    "Planeten hører til den sect, der er i favør: Solen, Jupiter og Saturn i et dagkort; Månen, Venus og Mars i et natkort. Merkur er diurnal som morgenstjerne og nocturnal som aftenstjerne. Sect vises særskilt og ændrer ingen farve.",
    `${BASIS}; ${SUPPLEMENT}`,
  ),
  row(
    "sect",
    "sectContrary",
    "Contrary sect",
    "Planeten hører til den sect, der ikke er i favør. Sect vises særskilt og ændrer ingen farve.",
    `${BASIS}; ${SUPPLEMENT}`,
  ),

  row(
    "joys",
    "joyHemisphere",
    "Joy by hemisphere",
    "Dagkort: diurnale planeter over horisonten, nocturnale under. Natkort: nocturnale over, diurnale under. Horisonten er den faktiske ASC–DSC-akse, ikke husnummeret.",
    `${ANSWERS}, punkt 8; ${DECISIONS}, punkt 11`,
  ),
  row(
    "joys",
    "joySignPolarity",
    "Joy by sign polarity",
    "Diurnale planeter i maskuline tegn, nocturnale i feminine tegn, uanset om horoskopet er et dag- eller natkort.",
    `${ANSWERS}, punkt 8; ${DECISIONS}, punkt 11`,
  ),
  row(
    "joys",
    "joySolarPhase",
    "Joy by solar phase",
    "Jupiter og Saturn som morgenstjerner (vest for Solen), Venus og Mars som aftenstjerner. Merkur som morgenstjerne i et dagkort og som aftenstjerne i et natkort. Månen indgår ikke.",
    `${ANSWERS}, punkt 8; ${DECISIONS}, punkt 2 og 11`,
  ),
  row(
    "joys",
    "joyHouse",
    "Planetary joy (hus)",
    "Merkur i 1., Månen i 3., Venus i 5., Mars i 6., Solen i 9., Jupiter i 11. og Saturn i 12. hus.",
    `${BASIS}; ${DECISIONS}, punkt 11`,
  ),

  row("dignities", "domicile", "Domicil", "Planeten står i et tegn, den selv hersker over.", BASIS),
  row("dignities", "exaltation", "Eksaltation", "Planeten står i sit eksaltationstegn.", BASIS),
  row(
    "dignities",
    "triplicity",
    "Triplicitet",
    "Planeten er en af de tre dorotheiske triplicitetsherskere (dag, nat eller deltagende) for tegnets element. De tre roller vurderes ens; rollen vises som fakta.",
    BASIS,
  ),
  row(
    "dignities",
    "bounds",
    "Bounds",
    "Planeten står i sine egne egyptiske bounds. Præcis på en grænse gælder den nye bound.",
    `${BASIS}; ${SUPPLEMENT}`,
  ),
  row(
    "dignities",
    "decan",
    "Decan",
    "Planeten står i sin egen kaldæiske decan. Vises som fakta uden vurderingsfarve.",
    BASIS,
  ),
  row(
    "dignities",
    "detriment",
    "Detriment",
    "Planeten står i tegnet over for sit domicil.",
    `${BASIS}; ${DECISIONS}, punkt 7`,
  ),
  row(
    "dignities",
    "fall",
    "Fall",
    "Planeten står i tegnet over for sin eksaltation.",
    `${BASIS}; ${DECISIONS}, punkt 8`,
  ),

  row(
    "sun",
    "cazimi",
    "Cazimi",
    "Planeten står inden for cazimi-grænsen fra Solen (standard 1°, grænsen medregnet). En særskilt soltilstand, som ikke samtidig vises som combust.",
    `${BASIS}; ${DECISIONS}, punkt 9`,
  ),
  row(
    "sun",
    "combust",
    "Combust",
    "Planeten står længere fra Solen end cazimi-grænsen og højst combust-grænsen (standard 8°, medregnet). Meget udfordrende; vurderingen skjules ved chariot.",
    `${BASIS}; ${SUPPLEMENT}; ${DECISIONS}, punkt 4`,
  ),
  row(
    "sun",
    "underBeams",
    "Under the beams",
    "Planeten står længere fra Solen end combust-grænsen og højst grænsen for under the beams (standard 15°, medregnet). Udfordrende; vurderingen skjules ved chariot.",
    `${BASIS}; ${SUPPLEMENT}; ${DECISIONS}, punkt 4`,
  ),
  row(
    "sun",
    "chariot",
    "Chariot: protected from beams",
    "Planeten er combust eller under the beams, men står i eget domicil, egen eksaltation eller egne bounds. Triplicitet tæller ikke. Den negative vurdering af solfasen skjules; afstanden til Solen beregnes fortsat.",
    `${BASIS}; ${SUPPLEMENT}`,
  ),

  row("houses", "houseAngular", "House: angular", "Planeten står i heltegnshus 1, 4, 7 eller 10.", BASIS),
  row(
    "houses",
    "houseFortunate",
    "House: fortunate",
    "Planeten står i heltegnshus 1, 3, 4, 5, 7, 9, 10 eller 11, regnet fra Ascendantens tegn. At hus 1 er med, er programmets valg.",
    `${DECISIONS}, punkt 1; Brennan, Hellenistic Astrology, kap. 10, s. 332–333`,
  ),
  row(
    "houses",
    "houseUnfortunate",
    "House: unfortunate",
    "Planeten står i heltegnshus 2, 6, 8 eller 12, regnet fra Ascendantens tegn.",
    `${ANSWERS}, punkt 10; Brennan, Hellenistic Astrology, kap. 10, s. 332–333`,
  ),
  row(
    "houses",
    "nearAngle",
    // Called "Tæt på en vinkel" until the Chart Analysis specification of
    // 15 November 2026 (section 11) renamed it. Not the same as "House:
    // angular", which is about the whole-sign house.
    "Angular",
    "Planeten står højst 3° fra ASC, DSC, MC eller IC, uanset hvilket heltegnshus den er i. Det er noget andet end “House: angular”, som gælder heltegnshus 1, 4, 7 og 10. Neutral: nærhed til en vinkel er ikke i sig selv en bonification.",
    `${BASIS}; ${DECISIONS}, punkt 10; Chart Analysis-kravspecifikation, 15. november 2026, punkt 11`,
  ),

  row(
    "copresence",
    "copresence",
    "Co-presence",
    "To planeter i samme tegn, uden orbkrav. Favored benefic: meget understøttende. Contrary benefic: understøttende. Favored malefic: udfordrende. Contrary malefic: meget udfordrende. Solen, Månen og Merkur vises uden farve.",
    BASIS,
  ),

  row(
    "domicileLord",
    "lordWitness",
    "Domicile lord witness",
    "Tegnets hersker står i heltegnssekstil, -kvadrat, -trigon eller -opposition til planeten.",
    BASIS,
  ),
  row("domicileLord", "lordCopresent", "Domicile lord copresent", "Tegnets hersker står i samme tegn som planeten.", BASIS),
  row(
    "domicileLord",
    "lordAversion",
    "Domicile lord aversion",
    "Tegnets hersker står i et tegn uden heltegnsforbindelse til planeten.",
    BASIS,
  ),

  row(
    "reception",
    "mutualReception",
    "Gensidig reception",
    "To planeter står hver i en af den andens værdigheder. Gensidig domicilreception er understøttende; de øvrige former vises uden farve. Et gradbaseret aspekt kræves ikke.",
    BASIS,
  ),
  row(
    "reception",
    "reception",
    "Reception",
    "Planeten står i en af en anden planets fem værdigheder: domicil, eksaltation, triplicitet, bounds eller decan. Vises uden vurderingsfarve. Et gradbaseret aspekt kræves ikke.",
    BASIS,
  ),

  row(
    "overcoming",
    "overcomes",
    "Overcomes",
    "Planeten står i højresidig heltegnssekstil, -kvadrat eller -trigon til en anden, dvs. 2, 3 eller 4 tegn tidligere i zodiakken. Kvadratet er Upon the Tenth / Domination. Graderne er uden betydning.",
    `Brennan, Hellenistic Astrology, s. 312–315; ${SUPPLEMENT}`,
  ),
  row(
    "overcoming",
    "overcomeBy",
    "Overcome by",
    "En anden planet står i højresidig heltegnssekstil, -kvadrat eller -trigon til planeten. Selve relationen vises uden farve; en afledt bonification eller maltreatment vises for sig.",
    `Brennan, Hellenistic Astrology, s. 312–315; ${SUPPLEMENT}`,
  ),

  row(
    "bonification",
    "byOvercoming",
    "Overcoming fra benefic",
    "Venus eller Jupiter overvinder planeten med højresidigt heltegnskvadrat eller -trigon.",
    `Brennan, kap. 14, s. 465–466; ${ANSWERS}, punkt 2`,
  ),
  row(
    "bonification",
    "superiorSextile",
    "Superior sekstil fra benefic",
    "Venus eller Jupiter overvinder planeten med højresidig heltegnssekstil. Understøttende, men ikke en fuld bonification.",
    `Brennan, s. 467; ${ANSWERS}, punkt 2`,
  ),
  row(
    "bonification",
    "signTrine",
    "Trigon fra benefic",
    "Venus eller Jupiter står i heltegnstrigon til planeten, fra højre eller venstre side, uden orb. Et bevidst valg, som går videre end Brennan.",
    `${ANSWERS}, punkt 4`,
  ),
  row(
    "bonification",
    "engagement",
    "Engagement med benefic",
    `Applicerende gradbaseret aspekt til Venus eller Jupiter ${CLOSE}. Kvadrat, trigon og opposition: meget understøttende. Sekstil: understøttende. En konjunktion er adherence og vises ikke også her.`,
    `${SUPPLEMENT}; ${ANSWERS}, punkt 5 og 6; ${DECISIONS}, punkt 3 og 6`,
  ),
  row(
    "bonification",
    "strikingRay",
    "Striking with a ray",
    "Venus eller Jupiter står senere i zodiakken og kaster en stråle bagud inden for 3° fra eksakt, applicerende eller separerende; applicerende er stærkere. Kvadrat, trigon og opposition: meget understøttende. Sekstil: understøttende. Den samlede regel er programmets valg; oppositionen støtter sig til Porphyrys omtale.",
    `${DECISIONS}, punkt 12`,
  ),
  row(
    "bonification",
    "adherence",
    "Adherence med benefic",
    `Applicerende konjunktion med Venus eller Jupiter ${CLOSE}.`,
    SUPPLEMENT,
  ),
  row(
    "bonification",
    "enclosure",
    "Enclosure mellem benefics",
    "Venus og Jupiter står begge, eller kaster begge stråler, højst 7° på hver sin side af planeten, og ingen anden planets krop eller stråle falder imellem. Én krop og én stråle tæller ikke.",
    `Brennan, kap. 14, s. 474–476; ${ANSWERS}, punkt 1; ${DECISIONS}, punkt 5. 7°-grænsen er programmets valg`,
  ),
  row(
    "bonification",
    "enclosureBroken",
    "Enclosure brudt",
    "En anden planets krop eller stråle (sekstil, kvadrat, trigon, opposition) falder mellem planeten og en af de indrammende. Indramningen er brudt og tæller ikke som bonification.",
    `Brennan, kap. 14, s. 474–476; ${ANSWERS}, punkt 1`,
  ),

  row(
    "maltreatment",
    "strikingRay",
    "Striking with a ray",
    "Mars eller Saturn står i underordnet position (senere i zodiakken) og kaster et kvadrat bagud inden for 3° fra eksakt, applicerende eller separerende; applicerende er stærkere.",
    `${SUPPLEMENT}; ${ANSWERS}, punkt 3`,
  ),
  row(
    "maltreatment",
    "byOvercoming",
    "Overcoming fra malefic",
    "Mars eller Saturn overvinder planeten med højresidigt heltegnskvadrat (Upon the Tenth), uanset hvilket hus de står i. Højresidig sekstil og trigon er kun overcoming.",
    `Brennan, kap. 14, s. 465–466; ${ANSWERS}, punkt 2`,
  ),
  row(
    "maltreatment",
    "signOpposition",
    "Opposition fra malefic",
    "Mars eller Saturn står i heltegnsopposition til planeten, uden orb.",
    `${ANSWERS}, punkt 4`,
  ),
  row(
    "maltreatment",
    "engagement",
    "Engagement med malefic",
    `Applicerende gradbaseret aspekt til Mars eller Saturn ${CLOSE}. Kvadrat og opposition: meget udfordrende. Sekstil og trigon vises som relation uden at være maltreatment.`,
    `${SUPPLEMENT}; ${ANSWERS}, punkt 5 og 6`,
  ),
  row(
    "maltreatment",
    "adherence",
    "Adherence med malefic",
    `Applicerende konjunktion med Mars eller Saturn ${CLOSE}.`,
    SUPPLEMENT,
  ),
  row(
    "maltreatment",
    "enclosure",
    "Enclosure mellem malefics",
    "Mars og Saturn står begge, eller kaster begge stråler, højst 7° på hver sin side af planeten (besiegement), og ingen anden planets krop eller stråle falder imellem. Én krop og én stråle tæller ikke.",
    `Brennan, kap. 14, s. 474–476; ${ANSWERS}, punkt 1; ${DECISIONS}, punkt 5. 7°-grænsen er programmets valg`,
  ),
  row(
    "maltreatment",
    "enclosureBroken",
    "Enclosure brudt",
    "En anden planets krop eller stråle (sekstil, kvadrat, trigon, opposition) falder mellem planeten og en af de indrammende. Indramningen er brudt og tæller ikke som maltreatment.",
    `Brennan, kap. 14, s. 474–476; ${ANSWERS}, punkt 1`,
  ),
];

/** The matrix row a condition belongs to. */
export function rowOf(condition: Pick<Condition, "group" | "kind">): ConditionRow | undefined {
  return CONDITION_ROWS.find((r) => r.group === condition.group && r.kind === condition.kind);
}

const listed = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;

const OWN_DIGNITY: Record<Dignity, string> = {
  domicile: "eget domicil",
  exaltation: "egen eksaltation",
  triplicity: "egen triplicitet",
  bounds: "egne bounds",
  decan: "egen decan",
};

/**
 * The particulars of one condition: who is involved, by what aspect and
 * how closely. Empty when the row's name says it all.
 */
export function conditionDetail(c: Condition): string {
  const who = listed(c.others.map((other) => POINT_NAMES[other]));
  const aspect = c.aspect ? ASPECT_NAMES[c.aspect].toLowerCase() : "";
  const orb = c.orb !== null ? formatOrb(c.orb) : "";
  const tenth = c.aspect === "square" ? " (Upon the Tenth)" : "";
  const motion =
    c.applying === null ? "stationær/uafklaret" : c.applying ? "applicerende" : "separerende";

  switch (c.kind) {
    case "sectFavored":
    case "sectContrary":
      return c.sectRole === "leader"
        ? "sectens leder"
        : c.sectRole === "benefic"
          ? "sectens benefic"
          : c.sectRole === "malefic"
            ? "sectens malefic"
            : "";
    case "triplicity":
      return c.triplicityRole === "day"
        ? "daghersker"
        : c.triplicityRole === "night"
          ? "nathersker"
          : "deltagende hersker";
    case "cazimi":
      return `${orb} fra Solen`;
    case "combust":
    case "underBeams":
      return c.suppressed
        ? `${orb} fra Solen · negativ vurdering skjult af chariot`
        : `${orb} fra Solen`;
    case "chariot":
      return `i ${listed(c.dignities.map((d) => OWN_DIGNITY[d]))}`;
    case "nearAngle":
      return c.angle ? `${orb} fra ${ANGLE_NAMES[c.angle]}` : "";
    case "copresence": {
      if (c.favored === null) return who;
      const nature = c.others[0] === "venus" || c.others[0] === "jupiter" ? "benefic" : "malefic";
      return `${who} (${c.favored ? "favored" : "contrary"} ${nature})`;
    }
    case "lordWitness":
      return `${who}, ${aspect}`;
    case "lordCopresent":
    case "lordAversion":
      return who;
    case "reception":
      return `modtages af ${who}: ${listed(c.dignities.map((d) => DIGNITY_NAMES[d]))}`;
    case "mutualReception":
      return `med ${who}: ${listed(c.dignities.map((d) => DIGNITY_NAMES[d]))} den ene vej, ${listed(
        c.returnDignities.map((d) => DIGNITY_NAMES[d]),
      )} den anden`;
    case "overcomes":
    case "overcomeBy":
      return `${who}, ${aspect}${tenth}`;
    case "byOvercoming":
      return `${who}, ${aspect}${tenth}`;
    case "superiorSextile":
    case "signTrine":
    case "signOpposition":
      return `${who}, ${aspect}`;
    case "engagement":
    case "adherence":
      return `${who}, ${aspect} ${orb}, ${motion}`;
    case "strikingRay":
      // Both directions count; the applying ray is the stronger one.
      return `${who}, ${aspect} ${orb}, ${motion}${c.applying ? " (stærkere)" : ""}`;
    case "enclosure":
      return `${who}, ${c.bodily ? "ved kroppene" : "ved stråler"}`;
    case "enclosureBroken": {
      const breakers = c.breakers.map(
        (b) => `${POINT_NAMES[b.body]} (${b.aspect ? ASPECT_NAMES[b.aspect].toLowerCase() : "krop"})`,
      );
      return `${who}, ${c.bodily ? "ved kroppene" : "ved stråler"} · brudt af ${listed(breakers)}`;
    }
    default:
      return "";
  }
}
