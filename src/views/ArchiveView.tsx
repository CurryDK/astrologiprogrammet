import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { countryName, formatBirthDate, type ChartRecord, type Folder } from "../astro";
import { SolarFireImport } from "./SolarFireImport";

/** "all", "none" (charts without a folder) or a folder id. */
export type FolderFilter = "all" | "none" | number;

type Props = {
  charts: ChartRecord[];
  folders: Folder[];
  filter: FolderFilter;
  onFilter: (filter: FolderFilter) => void;
  onOpen: (id: number) => void;
  onNew: () => void;
  /** Reload charts and folders after a change. */
  reload: () => Promise<void>;
};

/** The chart archive: search, and folders the user creates and names (specification §3). */
export function ArchiveView({ charts, folders, filter, onFilter, onOpen, onNew, reload }: Props) {
  const [search, setSearch] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (reason) {
      setError(String(reason));
    }
  };

  function createFolder(event: FormEvent) {
    event.preventDefault();
    if (!newFolder.trim()) return;
    run(async () => {
      await api.folderCreate(newFolder);
      setNewFolder("");
    });
  }

  function renameFolder(event: FormEvent) {
    event.preventDefault();
    if (!renaming || !renaming.name.trim()) return;
    run(async () => {
      await api.folderRename(renaming.id, renaming.name);
      setRenaming(null);
    });
  }

  function deleteFolder(id: number) {
    run(async () => {
      await api.folderDelete(id);
      setConfirmingDelete(null);
      if (filter === id) onFilter("all");
    });
  }

  const needle = search.trim().toLocaleLowerCase("da");
  const visible = charts.filter((chart) => {
    const inFolder =
      filter === "all" || (filter === "none" ? chart.folderId === null : chart.folderId === filter);
    const matches =
      needle === "" ||
      chart.name.toLocaleLowerCase("da").includes(needle) ||
      chart.placeName.toLocaleLowerCase("da").includes(needle);
    return inFolder && matches;
  });

  const count = (folderId: number | null) => charts.filter((c) => c.folderId === folderId).length;
  const selectedFolder = typeof filter === "number" ? folders.find((f) => f.id === filter) : null;

  return (
    <div className="archive">
      <aside className="folders">
        <h2>Mapper</h2>
        <ul>
          <li>
            <button className={filter === "all" ? "selected" : ""} onClick={() => onFilter("all")}>
              Alle horoskoper <span className="count">{charts.length}</span>
            </button>
          </li>
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                className={filter === folder.id ? "selected" : ""}
                onClick={() => onFilter(folder.id)}
              >
                {folder.name} <span className="count">{count(folder.id)}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              className={filter === "none" ? "selected" : ""}
              onClick={() => onFilter("none")}
            >
              Uden mappe <span className="count">{count(null)}</span>
            </button>
          </li>
        </ul>

        <form onSubmit={createFolder} className="inline-form">
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="Ny mappe …"
            aria-label="Navn på ny mappe"
          />
          <button type="submit" disabled={!newFolder.trim()}>
            Opret
          </button>
        </form>
      </aside>

      <section className="chart-list">
        <header>
          <h1>{selectedFolder ? selectedFolder.name : filter === "none" ? "Uden mappe" : "Arkiv"}</h1>
          <button className="primary" onClick={onNew}>
            Nyt horoskop
          </button>
        </header>

        {selectedFolder &&
          (renaming?.id === selectedFolder.id ? (
            <form onSubmit={renameFolder} className="inline-form">
              <input
                value={renaming.name}
                onChange={(e) => setRenaming({ id: renaming.id, name: e.target.value })}
                aria-label="Mappens navn"
                autoFocus
              />
              <button type="submit">Gem navn</button>
              <button type="button" onClick={() => setRenaming(null)}>
                Annuller
              </button>
            </form>
          ) : (
            <div className="folder-actions">
              <button onClick={() => setRenaming({ ...selectedFolder })}>Omdøb mappe</button>
              {confirmingDelete === selectedFolder.id ? (
                <>
                  <span className="muted">Horoskoperne i mappen bliver i arkivet.</span>
                  <button className="danger" onClick={() => deleteFolder(selectedFolder.id)}>
                    Bekræft sletning
                  </button>
                  <button onClick={() => setConfirmingDelete(null)}>Fortryd</button>
                </>
              ) : (
                <button onClick={() => setConfirmingDelete(selectedFolder.id)}>Slet mappe</button>
              )}
            </div>
          ))}

        {error && <p className="error">{error}</p>}

        <SolarFireImport
          reload={reload}
          onDone={(folderId) => onFilter(folderId ?? "all")}
        />

        <input
          className="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg på navn eller sted …"
          aria-label="Søg i arkivet"
        />

        {visible.length === 0 ? (
          <p className="muted">
            {charts.length === 0
              ? "Arkivet er tomt. Opret det første horoskop med knappen ovenfor."
              : "Ingen horoskoper matcher."}
          </p>
        ) : (
          <table className="chart-rows">
            <tbody>
              {visible.map((chart) => (
                <tr key={chart.id} onClick={() => onOpen(chart.id!)} tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(chart.id!)}>
                  <td className="name">{chart.name}</td>
                  <td>
                    {formatBirthDate(chart.birthDate)}
                    {chart.birthTime ? ` kl. ${chart.birthTime}` : ""}
                  </td>
                  <td className="muted">
                    {[chart.placeName, countryName(chart.countryCode)].filter(Boolean).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
