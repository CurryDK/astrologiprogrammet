import {
  ASPECT_GLYPHS,
  ASPECT_KINDS,
  ASPECT_NAMES,
  BODIES,
  ELEMENTS,
  ELEMENT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  RATINGS,
  type AngleMethod,
  type LeapDayBirthday,
  type YearStart,
} from "../astro";
import { RATING_NAMES } from "../conditionText";
import { DEFAULT_SETTINGS, useSettings, type LayerLines, type ModernDecanRulers, type WheelOrientation } from "../settings";

/** Colours and orbs. Every change takes effect at once and is remembered. */
export function SettingsView() {
  const { settings, update } = useSettings();

  return (
    <div className="settings">
      <h1>Indstillinger</h1>
      <p className="muted">Ændringer gælder med det samme og huskes til næste gang.</p>

      <div className="settings-boxes">
      <section className="panel">
        <h2>Aspekter</h2>
        <table>
          <thead>
            <tr>
              <th colSpan={2}>Aspekt</th>
              <th>Orb (grader)</th>
              <th>Farve</th>
            </tr>
          </thead>
          <tbody>
            {ASPECT_KINDS.map((kind) => (
              <tr key={kind}>
                <td className="glyph" style={{ color: settings.colors.aspects[kind] }}>
                  {ASPECT_GLYPHS[kind]}
                </td>
                <td>{ASPECT_NAMES[kind]}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    aria-label={`Orb for ${ASPECT_NAMES[kind]}`}
                    value={settings.orbs[kind]}
                    onChange={(e) => {
                      const value = e.target.valueAsNumber;
                      if (!Number.isFinite(value) || value < 0 || value > 15) return;
                      update((s) => ({ ...s, orbs: { ...s.orbs, [kind]: value } }));
                    }}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    aria-label={`Farve for ${ASPECT_NAMES[kind]}`}
                    value={settings.colors.aspects[kind]}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        colors: {
                          ...s.colors,
                          aspects: { ...s.colors.aspects, [kind]: e.target.value },
                        },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Konjunktioner mellem to natale planeter vises i aspektoversigten, men tegnes ikke som
          linje i hjulet. I Live Chart tegnes konjunktioner mellem en natal planet og en
          transiterende eller progredieret planet som linje. Linjerne i hjulet er tykkest ved
          eksakt aspekt og tyndest ved den valgte orb.
        </p>
      </section>

      <section className="panel">
        <h2>Lots</h2>
        <table>
          <tbody>
            <tr>
              <td>Orb for lot-aspekter (grader)</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  aria-label="Orb for lot-aspekter"
                  value={settings.lots.orb}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value) || value < 0 || value > 15) return;
                    update((s) => ({ ...s, lots: { ...s.lots, orb: value } }));
                  }}
                />
              </td>
            </tr>
            <tr>
              <td>Markeres som eksakt (e) under (grader)</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.25}
                  aria-label="Grænse for eksakt lot-aspekt"
                  value={settings.lots.exactOrb}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value) || value < 0 || value > 15) return;
                    update((s) => ({ ...s, lots: { ...s.lots, exactOrb: value } }));
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.lots.showSeconds}
            onChange={(e) =>
              update((s) => ({ ...s, lots: { ...s.lots, showSeconds: e.target.checked } }))
            }
          />
          Vis lots med sekunder i lots-oversigten
        </label>
        <p className="muted">
          Lots vises som standard i grader og minutter, afrundet til nærmeste minut. Afrundingen
          gælder kun visningen; beregningerne bruger altid den fulde præcision.
        </p>
        <p className="muted">
          Standard er 3° orb. Et lot-aspekt markeres med “e”, når orben er mindre end grænsen
          (standard 1°). Hvilke lots der vises i hjulet, og hvad lot-aspekter beregnes til, vælges
          under “Visning” ved horoskopet.
        </p>
      </section>

      <section className="panel">
        <h2>Transitter og Live Chart</h2>
        <table>
          <tbody>
            <tr>
              <td>Orb for transitaspekter (grader)</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  aria-label="Orb for transitaspekter"
                  value={settings.transits.orb}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value) || value < 0 || value > 15) return;
                    update((s) => ({ ...s, transits: { ...s.transits, orb: value } }));
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted">
          Standard er 7° for alle transitaspekter, både transit → natal og transit → transit.
          Hvilke transitplaneter, aspektgrupper og Time Lord-filtre der vises, vælges under
          “Visning” i Live Chart. Tidspunkter i Live Chart og for livsbegivenheder gælder
          computerens tidszone.
        </p>
      </section>

      <section className="panel">
        <h2>Sekundære progressioner</h2>
        <table>
          <tbody>
            <tr>
              <td>Orb for progressionsaspekter (grader)</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  aria-label="Orb for progressionsaspekter"
                  value={settings.progressions.orb}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value) || value < 0 || value > 15) return;
                    update((s) => ({ ...s, progressions: { ...s.progressions, orb: value } }));
                  }}
                />
              </td>
            </tr>
            <tr>
              <td>Progressiv ASC/MC</td>
              <td>
                <select
                  aria-label="Metode for progressiv ASC/MC"
                  value={settings.progressions.angleMethod}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      progressions: { ...s.progressions, angleMethod: e.target.value as AngleMethod },
                    }))
                  }
                >
                  <option value="naibodRightAscension">Naibod i rektascension</option>
                  <option value="naibodLongitude">Naibod i ekliptisk længde</option>
                </select>
              </td>
            </tr>
            <tr>
              <td>Aspektlinjer mellem lagene i Live Chart</td>
              <td>
                <select
                  aria-label="Aspektlinjer mellem lagene"
                  value={settings.layerLineEnds}
                  onChange={(e) =>
                    update((s) => ({ ...s, layerLineEnds: e.target.value as LayerLines }))
                  }
                >
                  <option value="planets">Fra natalplaneten ud til planeten uden for cirklen</option>
                  <option value="center">Mellem de eksakte grader inderst i hjulet</option>
                  <option value="rings">Fra hvert lags egen ring</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted">
          Standard er 1° orb for både progression → natal og progression → progression, og Naibod
          i rektascension for de progressive akser. Én dag efter fødslen svarer til ét tropisk år
          (365,2422 dage). Progressioner og transitter følger altid samme tidspunkt i Live Chart.
        </p>
      </section>

      <section className="panel">
        <h2>Planetary Condition</h2>
        <table>
          <thead>
            <tr>
              <th>Afstand til Solen</th>
              <th>Til og med (grader)</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["cazimi", "Cazimi"],
                ["combust", "Combust"],
                ["beams", "Under the beams"],
              ] as const
            ).map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    aria-label={`Grænse for ${label}`}
                    value={settings.condition[key]}
                    onChange={(e) => {
                      const value = e.target.valueAsNumber;
                      if (!Number.isFinite(value) || value < 0 || value > 30) return;
                      // The three limits must stay in order.
                      const next = { ...settings.condition, [key]: value };
                      if (next.cazimi > next.combust || next.combust > next.beams) return;
                      update((s) => ({ ...s, condition: { ...s.condition, [key]: value } }));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th>Vurdering</th>
              <th>Farve</th>
            </tr>
          </thead>
          <tbody>
            {RATINGS.map((rating) => (
              <tr key={rating}>
                <td>{RATING_NAMES[rating]}</td>
                <td>
                  <input
                    type="color"
                    aria-label={`Farve for ${RATING_NAMES[rating]}`}
                    value={settings.condition.colors[rating]}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        condition: {
                          ...s.condition,
                          colors: { ...s.condition.colors, [rating]: e.target.value },
                        },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Standard er cazimi til og med 1°, combust til og med 8° og under the beams til og med 15°.
          De tre grænser skal stå i stigende rækkefølge. “Meget understøttende” og “meget
          udfordrende” vises som udfyldte mærker, de to andre som kontur. Hvilke kategorier der
          vises, vælges under “Kategorier” ved Planetary Condition.
        </p>
      </section>

      <section className="panel">
        <h2>Profektioner</h2>
        <table>
          <tbody>
            <tr>
              <td>Profektionsåret begynder</td>
              <td>
                <select
                  aria-label="Profektionsåret begynder"
                  value={settings.profections.yearStart}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      profections: { ...s.profections, yearStart: e.target.value as YearStart },
                    }))
                  }
                >
                  <option value="birthClockTime">På fødselsdagen ved fødselsklokkeslættet</option>
                  <option value="midnight">På fødselsdagen kl. 00:00</option>
                  <option value="solarReturn">Når Solen vender tilbage til sin fødselsposition</option>
                </select>
              </td>
            </tr>
            <tr>
              <td>Fødselsdag for fødte 29. februar i år uden skuddag</td>
              <td>
                <select
                  aria-label="Fødselsdag for fødte 29. februar"
                  value={settings.profections.leapDay}
                  disabled={settings.profections.yearStart === "solarReturn"}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      profections: { ...s.profections, leapDay: e.target.value as LeapDayBirthday },
                    }))
                  }
                >
                  <option value="february28">28. februar</option>
                  <option value="march1">1. marts</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.profections.showTimes}
            onChange={(e) =>
              update((s) => ({
                ...s,
                profections: { ...s.profections, showTimes: e.target.checked },
              }))
            }
          />
          Vis klokkeslæt ved profektionsmånedernes datoer
        </label>
        <p className="muted">
          Standard er fødselsdagen ved fødselsklokkeslættet, 28. februar for fødte 29. februar, og
          datoer med klokkeslæt. Datoer og klokkeslæt gælder fødestedets tidszone. Tiden mellem to
          fødselsdage deles i 12 præcist lige lange måneder. For horoskoper uden kendt fødselstid
          vises kun datoer.
        </p>
      </section>

      <section className="panel">
        <h2>Horoskophjul</h2>
        <table>
          <thead>
            <tr>
              <th>Ring</th>
              <th>Vises</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["chaldeanDecans", "Kaldæiske decaner"],
                ["modernDecans", "Moderne decaner"],
                ["bounds", "Egyptiske bounds"],
              ] as const
            ).map(([ring, name]) => (
              <tr key={ring}>
                <td>{name}</td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${name} i hjulet`}
                    checked={settings.wheel.rings[ring]}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        wheel: { ...s.wheel, rings: { ...s.wheel.rings, [ring]: e.target.checked } },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td>Herskere i de moderne decaner</td>
              <td>
                <select
                  aria-label="Herskere i de moderne decaner"
                  value={settings.wheel.modernDecanRulers}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      wheel: { ...s.wheel, modernDecanRulers: e.target.value as ModernDecanRulers },
                    }))
                  }
                >
                  <option value="modern">Med Pluto, Uranus og Neptun</option>
                  <option value="traditional">Kun de traditionelle herskere</option>
                </select>
              </td>
            </tr>
            <tr>
              <td>Hjulets orientering</td>
              <td>
                <select
                  aria-label="Hjulets orientering"
                  value={settings.wheel.orientation}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      wheel: { ...s.wheel, orientation: e.target.value as WheelOrientation },
                    }))
                  }
                >
                  <option value="ascendant">ASC-graden på den vandrette linje til venstre</option>
                  <option value="risingSign">Starten af 1. hus på den vandrette linje til venstre</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th>Element</th>
              <th>Farve i zodiakringen</th>
            </tr>
          </thead>
          <tbody>
            {ELEMENTS.map((element) => (
              <tr key={element}>
                <td>{ELEMENT_NAMES[element]}</td>
                <td>
                  <input
                    type="color"
                    aria-label={`Farve for ${ELEMENT_NAMES[element]}`}
                    value={settings.colors.elements[element]}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        colors: {
                          ...s.colors,
                          elements: { ...s.colors.elements, [element]: e.target.value },
                        },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <button
            type="button"
            onClick={() =>
              update((s) => ({
                ...s,
                colors: { ...s.colors, elements: DEFAULT_SETTINGS.colors.elements },
              }))
            }
          >
            Gendan standardfarver
          </button>
        </p>
        <p className="muted">
          Ringene ligger mellem zodiakringen og gradskalaen og rykker sammen, når en ring skjules.
          Hver ring viser kun herskerens symbol. Standard er kaldæiske decaner og bounds slået til
          og moderne decaner slået fra.
        </p>
      </section>

      <section className="panel">
        <h2>Planeter og punkter</h2>
        <table>
          <thead>
            <tr>
              <th colSpan={2}></th>
              <th>Farve</th>
            </tr>
          </thead>
          <tbody>
            {BODIES.map((body) => (
              <tr key={body}>
                <td className="glyph" style={{ color: settings.colors.bodies[body] }}>
                  {POINT_GLYPHS[body]}
                </td>
                <td>{POINT_NAMES[body]}</td>
                <td>
                  <input
                    type="color"
                    aria-label={`Farve for ${POINT_NAMES[body]}`}
                    value={settings.colors.bodies[body]}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        colors: {
                          ...s.colors,
                          bodies: { ...s.colors.bodies, [body]: e.target.value },
                        },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Symbolet og dets positionsstreg i hjulet har altid samme farve.
        </p>
      </section>
      </div>
    </div>
  );
}
