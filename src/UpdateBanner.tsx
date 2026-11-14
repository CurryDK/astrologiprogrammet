import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type State =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; percent: number | null }
  | { kind: "failed" };

/** Checks for a new version once at startup and offers to install it. */
export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    check()
      .then((update) => {
        if (update && !cancelled) setState({ kind: "available", update });
      })
      // No network or no release yet: stay silent, the app works offline.
      .catch((error) => console.warn("Opdateringstjek mislykkedes:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  async function install(update: Update) {
    let total = 0;
    let received = 0;
    setState({ kind: "installing", percent: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0) {
            setState({
              kind: "installing",
              percent: Math.round((received / total) * 100),
            });
          }
        }
      });
      await relaunch();
    } catch (error) {
      console.error(error);
      setState({ kind: "failed" });
    }
  }

  if (state.kind === "idle") return null;

  return (
    <div className="update-banner" role="status">
      {state.kind === "available" && (
        <>
          <span>Version {state.update.version} er klar.</span>
          <button onClick={() => install(state.update)}>Opdater nu</button>
          <button className="quiet" onClick={() => setState({ kind: "idle" })}>
            Senere
          </button>
        </>
      )}
      {state.kind === "installing" && (
        <span>
          Opdaterer{state.percent !== null ? ` … ${state.percent} %` : " …"}
        </span>
      )}
      {state.kind === "failed" && (
        <>
          <span>Opdateringen kunne ikke installeres. Prøv igen senere.</span>
          <button className="quiet" onClick={() => setState({ kind: "idle" })}>
            Luk
          </button>
        </>
      )}
    </div>
  );
}
