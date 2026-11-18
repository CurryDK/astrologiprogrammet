import type { ReactNode } from "react";
import {
  ASPECT_GLYPHS,
  ASPECT_NAMES,
  ELEMENT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  RATINGS,
  SECT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  elementOf,
  type Body,
  type ChartRecord,
  type PlanetCondition,
  type Rating,
} from "../astro";
import {
  MODALITY_NAMES,
  analysisGroups,
  analysisLines,
  lordRelationOf,
  modalityOf,
  sectRoleOf,
  selfRulerships,
} from "../chartAnalysis";
import { RATING_NAMES } from "../conditionText";
import { useSettings, type Settings } from "../settings";
import { useConditionReport } from "../useConditionReport";
import { Box } from "./PanelBoard";

/** The bar beside a line: filled for "very", an outline otherwise, grey for a neutral fact. */
function Bar({ rating, colors }: { rating: Rating | null; colors: Settings["condition"]["colors"] }) {
  if (rating === null) return <span className="ca-bar fact" title="Fakta uden vurdering" />;
  const filled = rating === "verySupportive" || rating === "veryChallenging";
  return (
    <span
      className="ca-bar"
      title={RATING_NAMES[rating]}
      style={{ borderColor: colors[rating], background: filled ? colors[rating] : "transparent" }}
    />
  );
}

type Props = { record: ChartRecord };

/**
 * Chart Analysis (specification of 15 November 2026): a compact table of
 * placements and lords with the planets as columns, and under it a short
 * list of conditions per planet, grouped by sect. It reads the same report
 * as Planetary Condition and adds no rule, no score and no verdict.
 */
export function ChartAnalysisPanel({ record }: Props) {
  const { settings, update } = useSettings();
  const { colors, groups, analysisNeutral } = settings.condition;
  const { report, error } = useConditionReport(record);

  if (error) {
    return (
      <Box id="analysis" title="Chart Analysis" span="wide">
        <p className="error">Beregningen mislykkedes: {error}</p>
      </Box>
    );
  }
  if (!report) return null;

  const sectGroups = analysisGroups(report);
  const planets = sectGroups.flatMap((group) => group.planets);
  const glyph = (body: Body) => (
    <span className="glyph-inline" style={{ color: settings.colors.bodies[body] }} title={POINT_NAMES[body]}>
      {POINT_GLYPHS[body]}
    </span>
  );

  const rows: { label: string; cell: (planet: PlanetCondition) => { self: boolean; content: ReactNode } }[] = [
    {
      label: "Tegn, hus",
      cell: (planet) => ({
        self: false,
        content: (
          <>
            <span className="glyph-inline" title={SIGN_NAMES[planet.sign]}>
              {SIGN_GLYPHS[planet.sign]}
            </span>{" "}
            {planet.house}
          </>
        ),
      }),
    },
    {
      label: "Element, modalitet",
      cell: (planet) => ({
        self: false,
        content: (
          <span className="ca-words">
            {ELEMENT_NAMES[elementOf(planet.sign)]}
            <br />
            {MODALITY_NAMES[modalityOf(planet.sign)]}
          </span>
        ),
      }),
    },
    {
      label: "Domicile lord, relation",
      cell: (planet) => {
        const relation = lordRelationOf(planet);
        return {
          self: relation?.kind === "self",
          content: (
            <>
              {glyph(planet.lords.domicile)}
              {relation?.kind === "copresent" && (
                <span className="glyph-inline ca-relation" title="I samme tegn">
                  {ASPECT_GLYPHS.conjunction}
                </span>
              )}
              {relation?.kind === "witness" && (
                <span className="glyph-inline ca-relation" title={`Heltegns${ASPECT_NAMES[relation.aspect].toLowerCase()}`}>
                  {ASPECT_GLYPHS[relation.aspect]}
                </span>
              )}
              {relation?.kind === "aversion" && (
                <span className="ca-relation ca-words" title="Aversion: ingen heltegnsforbindelse">
                  av.
                </span>
              )}
            </>
          ),
        };
      },
    },
    {
      label: "Exaltation lord",
      cell: (planet) => ({
        self: selfRulerships(planet).exaltation,
        content: planet.lords.exaltation ? glyph(planet.lords.exaltation) : "–",
      }),
    },
    {
      label: "Bound lord",
      cell: (planet) => ({ self: selfRulerships(planet).bounds, content: glyph(planet.lords.bounds) }),
    },
    {
      label: "Triplicity lords",
      cell: (planet) => ({
        self: selfRulerships(planet).triplicity,
        content: planet.lords.triplicity.map((lord, index) => <span key={index}>{glyph(lord)}</span>),
      }),
    },
    {
      label: "Decan lord",
      cell: (planet) => ({ self: selfRulerships(planet).decan, content: glyph(planet.lords.decan) }),
    },
  ];

  return (
    <Box
      id="analysis"
      title="Chart Analysis"
      span="wide"
      className="chart-analysis"
      actions={
        <label className="check">
          <input
            type="checkbox"
            checked={analysisNeutral}
            onChange={(e) =>
              update((s) => ({ ...s, condition: { ...s.condition, analysisNeutral: e.target.checked } }))
            }
          />
          Vis neutrale fakta
        </label>
      }
    >
      <p className="muted">
        {SECT_NAMES[report.sect]}
        {report.overridden && " (valgt manuelt)"}
        <span className="ca-self-key">
          <span className="ca-self-swatch" /> Self rulership
        </span>
      </p>

      <div className="cond-scroll">
        <table className="ca-table">
          <thead>
            <tr>
              <th></th>
              {planets.map((planet) => (
                <th key={planet.body} title={`${POINT_NAMES[planet.body]} · ${sectRoleOf(planet)}`}>
                  <span className="glyph-inline">{POINT_GLYPHS[planet.body]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {planets.map((planet) => {
                  const { self, content } = row.cell(planet);
                  return (
                    <td key={planet.body} className={self ? "self" : undefined}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ca-lists">
        {sectGroups.map((group) => (
          <div key={group.side} className="ca-group">
            <h3 className="ca-group-title">{group.title}</h3>
            {group.side === "undetermined" && (
              <p className="muted ca-note">
                Merkur står i eksakt konjunktion med Solen. Morgen/aften og dermed sect er uafklaret,
                så Merkur er ikke lagt i nogen af grupperne.
              </p>
            )}
            {group.planets.map((planet) => {
              const lines = analysisLines(planet, groups, analysisNeutral);
              return (
                <div key={planet.body} className="ca-planet">
                  <h4>
                    {glyph(planet.body)} <span>{sectRoleOf(planet)}</span>
                  </h4>
                  {lines.length === 0 ? (
                    <p className="muted ca-note">Ingen betingelser i de viste kategorier.</p>
                  ) : (
                    <ul>
                      {lines.map((line, index) => (
                        <li key={index} title={line.rule}>
                          <Bar rating={line.rating} colors={colors} />
                          <span>{line.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="cond-legend ca-legend">
        {RATINGS.map((rating) => (
          <li key={rating}>
            <Bar rating={rating} colors={colors} /> {RATING_NAMES[rating]}
          </li>
        ))}
        <li>
          <Bar rating={null} colors={colors} /> Fakta uden vurdering
        </li>
      </ul>
      <p className="muted legend">
        Samme beregning som Planetary Condition nedenfor, hvor regel og kilde for hver betingelse kan
        foldes ud. Der er ingen point eller samlet vurdering. Kategorierne vælges under “Kategorier”
        ved Planetary Condition.
      </p>
    </Box>
  );
}
