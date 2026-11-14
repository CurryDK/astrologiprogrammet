import { formatBirthDate } from "../astro";
import { CHANGELOG } from "../changelog";

type Props = {
  /** The running version, to mark its entry. */
  currentVersion: string | null;
};

/** What each version added and changed, newest first. */
export function ChangelogView({ currentVersion }: Props) {
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <>
        <h3>{title}</h3>
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </>
    );

  return (
    <div className="changelog">
      <h1>Ændringslog</h1>
      <p className="muted">Hvad der er tilføjet og ændret i hver version, nyeste først.</p>
      {CHANGELOG.map((entry) => (
        <section className="panel" key={entry.version}>
          <h2>
            Version {entry.version}
            {entry.version === currentVersion && <span className="current">Installeret</span>}
            <span className="muted date">{formatBirthDate(entry.date)}</span>
          </h2>
          {list("Tilføjet", entry.added)}
          {list("Ændret", entry.changed)}
        </section>
      ))}
    </div>
  );
}
