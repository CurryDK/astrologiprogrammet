import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SkyNow } from "./SkyNow";
import { UpdateBanner } from "./UpdateBanner";
import "./App.css";

type AppInfo = { version: string; coreVersion: string };

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    invoke<AppInfo>("app_info").then(setInfo).catch(console.error);
  }, []);

  return (
    <>
      <UpdateBanner />
      <main className="start">
        <h1>Astrologiprogrammet</h1>
        <SkyNow />
        <p className="version">{info ? `Version ${info.version}` : " "}</p>
      </main>
    </>
  );
}

export default App;
