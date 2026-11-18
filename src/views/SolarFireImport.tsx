import { useState } from "react";
import { api } from "../api";
import {
  countryName,
  formatBirthDate,
  formatOffset,
  type SolarFireChart,
  type SolarFireFile,
} from "../astro";

/** One chosen file with what the user has decided about it. */
type Pending = {
  fileName: string;
  bytes: number[];
  file: SolarFireFile;
  /** Name of the folder the charts go into; empty for none. */
  folder: string;
  /** Positions in `file.charts` of the charts to import. */
  selected: number[];
};

type Props = {
  /** Called after an import with the folder of the last file, to show it. */
  onDone: (folderId: number | null) => void;
  /** Reload charts and folders after a change. */
  reload: () => Promise<void>;
};

const importable = (chart: SolarFireChart) => chart.problem === null;

/** What the user should know about a chart before importing it. */
function remarks(chart: SolarFireChart): string[] {
  const list: string[] = [];
  if (chart.problem !== null) list.push(`Kan ikke importeres: ${chart.problem}`);
  if (chart.inArchive) list.push("Findes allerede i arkivet");
  if (chart.offsetSeconds !== null) {
    list.push(
      chart.zone === null
        ? `Ingen tidszone fundet for stedet – filens UTC-forskel ${formatOffset(chart.offsetSeconds)} bruges`
        : `Filens UTC-forskel ${formatOffset(chart.offsetSeconds)} afviger fra tidszonens og bevares`,
    );
  }
  if (chart.eventsSkipped > 0) {
    list.push(`${chart.eventsSkipped} livsbegivenhed(er) med ugyldig dato udelades`);
  }
  return list;
}

/**
 * Import of chart files from Solar Fire (`.SFcht`): choose files, see what
 * they hold, and save the chosen charts with their life events in a folder.
 */
export function SolarFireImport({ onDone, reload }: Props) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function choose(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setDone(null);
    const read: Pending[] = [];
    const failed: string[] = [];
    for (const chosen of Array.from(files)) {
      try {
        const bytes = Array.from(new Uint8Array(await chosen.arrayBuffer()));
        const file = await api.solarFireRead(bytes);
        read.push({
          fileName: chosen.name,
          bytes,
          file,
          folder: chosen.name.replace(/\.[^.]+$/, ""),
          selected: file.charts.flatMap((chart, index) =>
            importable(chart) && !chart.inArchive ? [index] : [],
          ),
        });
      } catch (reason) {
        failed.push(`${chosen.name}: ${String(reason)}`);
      }
    }
    setPending(read);
    if (failed.length > 0) setError(failed.join(" · "));
  }

  const change = (index: number, patch: Partial<Pending>) =>
    setPending((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  function toggle(index: number, chart: number) {
    const { selected } = pending[index];
    change(index, {
      selected: selected.includes(chart) ? selected.filter((c) => c !== chart) : [...selected, chart],
    });
  }

  async function importAll() {
    setBusy(true);
    setError(null);
    try {
      let charts = 0;
      let events = 0;
      let folderId: number | null = null;
      for (const item of pending) {
        if (item.selected.length === 0) continue;
        const summary = await api.solarFireImport(
          item.bytes,
          item.folder,
          [...item.selected].sort((a, b) => a - b),
        );
        charts += summary.charts;
        events += summary.events;
        folderId = summary.folderId;
      }
      await reload();
      setPending([]);
      setDone(`${charts} horoskoper og ${events} livsbegivenheder er importeret.`);
      onDone(folderId);
    } catch (reason) {
      setError(String(reason));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const total = pending.reduce((sum, item) => sum + item.selected.length, 0);

  return (
    <div className="sf-import">
      <label className="button">
        Importér fra Solar Fire …
        <input
          type="file"
          accept=".SFcht,.sfcht"
          multiple
          hidden
          onChange={(e) => {
            choose(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {error && <p className="error">{error}</p>}
      {done && <p className="notice">{done}</p>}

      {pending.length > 0 && (
        <section className="sf-import-panel" aria-label="Import fra Solar Fire">
          <h2>Import fra Solar Fire</h2>
          <p className="muted">
            Vælg de horoskoper, der skal med. Livsbegivenheder følger med deres horoskop. Klokkeslæt
            gemmes i hele minutter, og et horoskop, som Solar Fire har markeret med ukendt
            fødselstid (X) kl. 12:00, importeres uden klokkeslæt. Solar Fires kilde, vurdering og
            noter til et horoskop kommer ikke med.
          </p>

          {pending.map((item, index) => {
            const candidates = item.file.charts.flatMap((chart, i) => (importable(chart) ? [i] : []));
            return (
              <div className="sf-file" key={item.fileName}>
                <header>
                  <h3>
                    {item.fileName} <span className="muted">· {item.file.charts.length} horoskoper</span>
                  </h3>
                  <label>
                    Mappe{" "}
                    <input
                      value={item.folder}
                      onChange={(e) => change(index, { folder: e.target.value })}
                      placeholder="Uden mappe"
                    />
                  </label>
                  <button type="button" onClick={() => change(index, { selected: candidates })}>
                    Vælg alle
                  </button>
                  <button type="button" onClick={() => change(index, { selected: [] })}>
                    Vælg ingen
                  </button>
                </header>
                <table className="sf-charts">
                  <tbody>
                    {item.file.charts.map((chart, i) => (
                      <tr key={i} className={importable(chart) ? "" : "unusable"}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Importér ${chart.name}`}
                            checked={item.selected.includes(i)}
                            disabled={!importable(chart)}
                            onChange={() => toggle(index, i)}
                          />
                        </td>
                        <td className="name">{chart.name}</td>
                        <td>
                          {formatBirthDate(chart.birthDate)}
                          {chart.birthTime ? ` kl. ${chart.birthTime}` : " · klokkeslæt ukendt"}
                        </td>
                        <td className="muted">
                          {[chart.placeName, countryName(chart.countryCode)].filter(Boolean).join(", ")}
                        </td>
                        <td className="muted">
                          {chart.events.length > 0 ? `${chart.events.length} livsbegivenheder` : ""}
                        </td>
                        <td className="remarks">{remarks(chart).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="sf-actions">
            <button className="primary" disabled={busy || total === 0} onClick={importAll}>
              {busy ? "Importerer …" : `Importér ${total} horoskoper`}
            </button>
            <button type="button" disabled={busy} onClick={() => setPending([])}>
              Annuller
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
