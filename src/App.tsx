import { useCallback, useEffect, useState } from "react";
import { api, type AppInfo } from "./api";
import type { ChartRecord, Folder } from "./astro";
import { SettingsProvider } from "./settings";
import { UpdateBanner } from "./UpdateBanner";
import { ArchiveView, type FolderFilter } from "./views/ArchiveView";
import { ChangelogView } from "./views/ChangelogView";
import { ChartForm } from "./views/ChartForm";
import { ChartView } from "./views/ChartView";
import { LiveChartView } from "./views/LiveChartView";
import { TransitView } from "./views/TransitView";
import { SettingsView } from "./views/SettingsView";
import { StartView } from "./views/StartView";
import "./App.css";

type View =
  | { name: "start" | "archive" | "transit" | "settings" | "changelog" }
  | { name: "chart"; id: number }
  /** Live Chart of a natal chart; `at` is the UTC instant to open at (null: now). */
  | { name: "live"; id: number; at: string | null }
  /** `id` null means a new chart. */
  | { name: "form"; id: number | null };

function App() {
  const [view, setView] = useState<View>({ name: "start" });
  const [charts, setCharts] = useState<ChartRecord[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [chartList, folderList] = await Promise.all([api.chartsList(), api.foldersList()]);
      setCharts(chartList);
      setFolders(folderList);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => {
    reload();
    api.appInfo().then(setInfo).catch(console.error);
  }, [reload]);

  const openChart = (id: number) => setView({ name: "chart", id });
  const current = view.name === "chart" || view.name === "form" || view.name === "live"
    ? charts.find((chart) => chart.id === view.id) ?? null
    : null;

  const tab = (name: "start" | "archive" | "transit" | "settings", label: string) => (
    <button
      className={view.name === name || (name === "archive" && (view.name === "chart" || view.name === "form" || view.name === "live")) ? "selected" : ""}
      onClick={() => setView({ name })}
    >
      {label}
    </button>
  );

  return (
    <SettingsProvider>
      <UpdateBanner />
      <nav className="top-bar">
        <span className="title">Astrologiprogrammet</span>
        {tab("start", "Start")}
        {tab("archive", "Arkiv")}
        {tab("transit", "Transitter")}
        {tab("settings", "Indstillinger")}
        <button
          className={`version${view.name === "changelog" ? " selected" : ""}`}
          title="Se ændringsloggen"
          onClick={() => setView({ name: "changelog" })}
        >
          {info ? `Version ${info.version}` : "Ændringslog"}
        </button>
      </nav>

      <main>
        {error && <p className="error">Data kunne ikke hentes: {error}</p>}

        {view.name === "start" && (
          <StartView
            charts={charts}
            onOpen={openChart}
            onArchive={() => setView({ name: "archive" })}
          />
        )}

        {view.name === "archive" && (
          <ArchiveView
            charts={charts}
            folders={folders}
            filter={folderFilter}
            onFilter={setFolderFilter}
            onOpen={openChart}
            onNew={() => setView({ name: "form", id: null })}
            reload={reload}
          />
        )}

        {view.name === "chart" && current && (
          <ChartView
            record={current}
            onEdit={() => setView({ name: "form", id: view.id })}
            onLive={(at) => setView({ name: "live", id: view.id, at })}
            onChanged={reload}
            onDeleted={async () => {
              await reload();
              setView({ name: "archive" });
            }}
          />
        )}

        {view.name === "form" && (view.id === null || current) && (
          <ChartForm
            key={view.id ?? "new"}
            initial={current}
            folders={folders}
            defaultFolderId={typeof folderFilter === "number" ? folderFilter : null}
            onSaved={async (saved) => {
              await reload();
              setView({ name: "chart", id: saved.id! });
            }}
            onCancel={() =>
              setView(view.id === null ? { name: "archive" } : { name: "chart", id: view.id })
            }
          />
        )}

        {view.name === "live" && current && (
          <LiveChartView
            // A new moment asked for from outside starts the view afresh.
            key={`${view.id}-${view.at ?? "now"}`}
            record={current}
            initialAt={view.at}
            onBack={() => setView({ name: "chart", id: view.id })}
          />
        )}

        {view.name === "transit" && <TransitView />}

        {view.name === "settings" && <SettingsView />}

        {view.name === "changelog" && <ChangelogView currentVersion={info?.version ?? null} />}
      </main>
    </SettingsProvider>
  );
}

export default App;
