import {
  ASPECT_GLYPHS,
  ASPECT_KINDS,
  ASPECT_NAMES,
  BODIES,
  POINT_GLYPHS,
  POINT_NAMES,
  RATINGS,
  type LeapDayBirthday,
  type YearStart,
} from "../astro";
import { RATING_NAMES } from "../conditionText";
import { useSettings } from "../settings";

/** Colours and orbs. Every change takes effect at once and is remembered. */
export function SettingsView() {
  const { settings, update } = useSettings();

  return (
    <div className="settings">
      <h1>Indstillinger</h1>
      <p className="muted">Ændringer gælder med det samme og huskes til næste gang.</p>

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
          Konjunktioner vises i aspektoversigten, men tegnes ikke som linje i hjulet. Linjerne i
          hjulet er tykkest ved eksakt aspekt og tyndest ved den valgte orb.
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
  );
}
