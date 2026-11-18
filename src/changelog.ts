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
    version: "0.8.0",
    date: "2026-11-18",
    added: [
      "Alle informationskasser ved natalhoroskopet, i Live Chart og under Transitter kan nu klappes sammen og åbnes hver for sig med et tryk på overskriften. Programmet husker, hvilke kasser der er åbne, særskilt for natalhoroskop, Transitter og Live Chart – ikke for hvert enkelt horoskop.",
      "Når en kasse åbnes eller lukkes, flytter de øvrige kasser sig, så pladsen ved siden af og under hjulet udnyttes, og der ikke står store tomme områder.",
      "“Nulstil layout” øverst i hver af de tre visninger åbner og lukker kasserne som fra start. Horoskopdata, beregninger, farver og øvrige indstillinger ændres ikke.",
      "Live Chart: “Gem som livsbegivenhed” åbner en ny livsbegivenhed med den dato og det klokkeslæt, Live Chart står på – ikke computerens aktuelle tid. Giv den et navn, ret eventuelt dato og tid, og gem. “Ny begivenhed” virker som før.",
    ],
    changed: [
      "Horoskophjulet står altid øverst til venstre og beholder sin størrelse og plads, når kasser åbnes og lukkes. Det følger kun programvinduets størrelse og er tilpasset, så hele hjulet kan ses uden at rulle ved normal vinduesstørrelse.",
      "Live Chart: dato, tidsnavigation, alder, årets og månedens Time Lord og rektifikation står nu til højre for hjulet i stedet for over det. Forklaringen af linjetyperne er flyttet ind i “Visning”.",
      "Transitter: “Himlen på et valgt tidspunkt” står på samme linje som datoen, så hjulet rykker op.",
      "Aspektoversigten ved natalhoroskopet og under Transitter er mere kompakt: én linje for hver planet med dens aspekter ved siden af hinanden. Opstillingen er et forslag og kan ændres.",
      "Lots-symbolerne i “Visning” har samme størrelse som i hjulet.",
      "Indstillinger: kasserne er fordelt i flere kolonner over hele vinduets bredde.",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-11-15",
    added: [
      "Ny indstilling “Hjulets orientering” under Indstillinger → Horoskophjul. Standard er som hidtil: hjulet drejes efter Ascendantens præcise grad, så ASC står på den vandrette linje til venstre (kl. 9) og DSC til højre (kl. 3). Alternativet lægger starten af 1. hus (0° i det opstigende tegn) på den vandrette linje, så 1. hus strækker sig nedad fra linjen, og ASC står ved sin egen grad.",
    ],
    changed: [
      "Kun tegningen drejes. Planetpositioner, huse og aspekter er de samme i begge orienteringer, og MC og IC står altid ved deres faktiske grader. Valget gælder også hjulet i Live Chart.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-11-15",
    added: [
      "Chart Analysis: en ny, kompakt oversigt på horoskopsiden mellem hjulet og Planetary Condition. Øverst en tabel med planeterne som kolonner: tegn og hus, element og modalitet, domicile lord med dens relation til planeten, exaltation lord, bound lord, triplicity lords og decan lord. Self rulership er markeret med en svag farve.",
      "Under tabellen står en kort liste for hver planet med dens betingelser, grupperet efter sect: favored sect først, derefter contrary sect. Merkur står i den gruppe, dens beregnede sect giver; ved eksakt konjunktion med Solen står den for sig som uafklaret.",
      "Hver linje er markeret med en streg: udfyldt turkis (meget understøttende), turkis kontur (understøttende), rød kontur (udfordrende), udfyldt rød (meget udfordrende) eller grå (fakta uden vurdering). Hold musen over en linje for at se reglen.",
      "“Vis neutrale fakta” i Chart Analysis skjuler eller viser de linjer, der ikke har en vurdering. Valget huskes.",
    ],
    changed: [
      "Chart Analysis og Planetary Condition bygger på samme beregning og viser derfor altid det samme. Kategorier, der er slået fra under Planetary Condition, er også skjult i Chart Analysis. Der er fortsat ingen point eller samlet vurdering.",
      "Lots-symbolerne i hjulet har nu samme størrelse som planetsymbolerne, og cirklen omslutter kun lige planetsymbolet.",
      "“Tæt på en vinkel” hedder nu “Angular”. Reglen er uændret (højst 3° fra ASC, DSC, MC eller IC) og er stadig noget andet end “House: angular”.",
    ],
  },
  {
    version: "0.6.3",
    date: "2026-11-15",
    added: [],
    changed: [
      "Grad- og minuttallene under planeterne i hjulet er blevet mindre.",
      "Planetens glyf og tal står nu så vidt muligt inde i det tegn, planeten hører til. En planet tæt på en tegngrænse rykkes lige inden for grænsen; den tynde streg viser stadig den præcise grad. Står der mange planeter i samme tegn, kan nogle stadig nå ind over nabotegnet.",
    ],
  },
  {
    version: "0.6.2",
    date: "2026-11-15",
    added: [],
    changed: [
      "Stenbukken og Pluto har fået de ønskede glyffer: Stenbukken med flad overstreg og løkke, Pluto som cirkel med halvmåne. De bruges overalt i programmet, både i hjulet og i tabellerne.",
    ],
  },
  {
    version: "0.6.1",
    date: "2026-11-15",
    added: [
      "Peg på en planet i hjulet for at fremhæve dens aspektlinjer; de øvrige linjer dæmpes. Klik på planeten for at holde fremhævningen, og klik igen eller et andet sted i hjulet for at slippe den. Virker også for progressive planeter og transitplaneter i Live Chart.",
      "En lille prik i planetens farve viser, hvor aspektlinjerne møder planeten.",
    ],
    changed: [
      "Aspektlinjerne går nu helt ud til planeterne i stedet for at ende på en fælles cirkel inde i hjulet. Er en planet flyttet lidt for at undgå overlap, følger linjen med; den tynde streg viser stadig den præcise grad.",
      "Aspektlinjerne er en smule gennemsigtige, så krydsninger og husnumre kan ses igennem dem.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-11-15",
    added: [
      "Sekundære progressioner i Live Chart: natalhoroskopet inderst, progressionerne i midten og transitterne yderst. Progressioner og transitter følger altid samme tidspunkt. Hvert lag kan slås fra under “Visning”.",
      "Progressionerne beregnes som dag-for-et-år med et tropisk år på 365,2422 dage. Progressiv ASC og MC beregnes med Naibod i rektascension; Naibod i ekliptisk længde kan vælges under Indstillinger.",
      "Progressionsaspekter: progression → natal og progression → progression, hver for sig til og fra. Standardorb er 1° og kan ændres under Indstillinger. Progressive planeter til natal ASC/MC og progressiv ASC/MC til natale planeter er med.",
      "“Eksakt” på et progressionsaspekt springer Live Chart til tidspunktet, hvor aspektet er eksakt. Er der flere passager, kan der vælges mellem dem.",
      "Oversigten “Progressive positioner” med tegn, grad og natalhoroskopets heltegnshus. Hver progressiv planet og akse kan vælges til og fra i hjulet og i aspekter.",
      "Rektifikation i Live Chart: fødselstiden kan flyttes ±1 minut, ±10 minutter og ±1 time eller indtastes direkte, mens Live Chart-tidspunktet står fast. Natalpositioner, ASC/MC, huse, lots, profektioner, Planetary Condition, progressioner og aspekter regnes om med det samme.",
      "En justeret fødselstid gemmes med “Gem som nyt horoskop” (forvalgt, livsbegivenhederne følger med) eller “Overskriv”. Den oprindelige fødselstid bevares, indtil der gemmes.",
      "Ved ukendt fødselstid bruges kl. 12:00 til progressionerne; progressiv ASC/MC, husplaceringer og akseaspekter udelades.",
      "Horoskophjulet: elementfarver i zodiakringen (ild, jord, luft, vand). Farverne kan ændres og gendannes under Indstillinger.",
      "Horoskophjulet: ringe med kaldæiske decaner og egyptiske bounds, og moderne decaner som kan slås til. Hver ring viser herskerens symbol. Ringene vælges under Indstillinger og rykker sammen, når en skjules.",
      "De syv lots har fået deres symboler: ⊗ for Fortune, ⊕ for Spirit og en tynd cirkel om planetens symbol for Eros (Venus), Necessity (Merkur), Courage (Mars), Victory (Jupiter) og Nemesis (Saturn). Alle lots kan slås til og fra i hjulet på én gang.",
      "Indstilling for aspektlinjer mellem lagene i Live Chart: mellem de eksakte grader inderst i hjulet (standard) eller fra hvert lags egen ring.",
    ],
    changed: [
      "Planeterne i hjulet står nu lodret overalt: symbol, grader, minutter og Rx under hinanden i planetens farve, med en tynd streg til den præcise position. Grader og minutter har samme størrelse.",
      "Retrograd vises som Rx i hjulet i stedet for R.",
      "Tekst og symboler i hjulet beholder deres størrelse, når vinduet ændres. Hjulet har en mindste størrelse og kan rulles sidelæns, hvis vinduet er smallere.",
      "Gradskalaen ligger nu lige inden for den inderste ring, med en kort streg for hver grad og en længere for hver femte.",
      "Husgrænserne er tynde grå linjer helt ind til centrum, og husnumrene står tæt på centrum.",
      "Aspektlinjerne ender nu på en cirkel lige inden for planeterne, ved hver planets præcise grad.",
      "ASC, DSC, MC og IC vises som et punkt med en kort streg og gradangivelse.",
      "Tal og tekst i hjulet er sat med Verdana.",
      "Lots er skjult i hjulet som standard. Har du allerede gemte indstillinger, er de fortsat slået til, indtil du slår dem fra.",
    ],
  },
  {
    version: "0.5.1",
    date: "2026-11-15",
    added: [
      "Planetary Condition: striking with a ray fra Venus og Jupiter. Kun stråler bagud i zodiakken, inden for 3° fra eksakt, både applicerende og separerende. Kvadrat, trigon og opposition er meget understøttende, sekstil understøttende. Applicerende er markeret som stærkere.",
      "Planetary Condition: rækken “Hastighed” øverst i matrixen viser Retro, Slow eller Fast for hver planet. Retro ved retrograd bevægelse; ellers Slow under og Fast på eller over Demetra Georges gennemsnitshastighed for planeten. Den faktiske daglige hastighed vises fortsat i detaljerne.",
      "Merkur har nu joy by solar phase: som morgenstjerne i et dagkort og som aftenstjerne i et natkort.",
    ],
    changed: [
      "1. hus vises nu både som House: angular og House: fortunate.",
      "Combust er nu meget udfordrende (udfyldt rød). Under the beams er fortsat udfordrende (rød kontur). Chariot skjuler stadig vurderingen.",
      "Cazimi er nu meget understøttende (udfyldt turkis).",
      "Detriment og fall er nu udfordrende (rød kontur) i stedet for fakta uden vurdering.",
      "De fire joys er nu understøttende (turkis kontur) i stedet for fakta uden vurdering.",
      "Ved striking with a ray fra Mars og Saturn er en applicerende stråle nu også markeret som stærkere.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-11-15",
    added: [
      "Planetary Condition for natalhoroskoper: en samlet matrix med de syv traditionelle planeter som kolonner og betingelserne som rækker. Vises under horoskophjulet.",
      "Detaljer for hver planet, som kan foldes ud hver for sig eller med “Åbn alle” og “Luk alle”. Tryk på en betingelse for at se vurdering, regel og kilde.",
      "Fire vurderinger: meget understøttende (udfyldt turkis), understøttende (turkis kontur), udfordrende (rød kontur) og meget udfordrende (udfyldt rød). Fakta uden vurdering vises med en grå prik. Der er ingen point og ingen samlet vurdering.",
      "Sect: sect light, favored og contrary sect med leder, benefic og malefic. Merkur er diurnal som morgenstjerne og nocturnal som aftenstjerne. Sect ændrer ingen farve.",
      "Essential dignities: domicil, eksaltation, dorotheiske tripliciteter, egyptiske bounds og kaldæiske decaner samt detriment og fall. Herskerne for planetens position vises i detaljerne.",
      "Forhold til Solen: cazimi, combust, under the beams og chariot. Ved chariot skjules den negative vurdering, mens afstanden til Solen stadig vises.",
      "Huse: husnummer og hustype samt House: angular, fortunate og unfortunate (11. hus er fortunate), og planeter højst 3° fra en vinkel.",
      "Joy by hemisphere, joy by sign polarity, joy by solar phase og planetary joys i huse som fire særskilte forhold.",
      "Co-presence, domicile lord (witness, copresent, aversion), reception efter alle fem værdigheder og overcoming med Upon the Tenth.",
      "Bonification og maltreatment: overcoming, heltegnstrigon fra benefic, heltegnsopposition fra malefic, engagement, adherence, striking with a ray fra Mars og Saturn samt enclosure ved kroppe og ved stråler. En enclosure, der brydes af en anden planets krop eller stråle, vises som brudt med angivelse af, hvem der bryder den.",
      "Direkte eller retrograd bevægelse, daglig hastighed og seneste og næste station for Merkur til Saturn.",
      "De enkelte kategorier kan slås til og fra under “Kategorier”. Valget huskes.",
      "Indstillinger for grænserne for cazimi, combust og under the beams (standard 1°, 8° og 15°) og for de fire vurderingsfarver.",
    ],
    changed: [
      "Horoskopvisningen har fået panelet Planetary Condition mellem hjulet og profektionerne. Panelet følger et manuelt valgt dag- eller natkort.",
    ],
  },
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
