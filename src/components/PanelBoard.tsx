import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { GAP, WIDE_BOX, boardColumns, boxFrame, chooseColumns, fillColumns, wheelRoom, type Size, type Span } from "../panelLayout";
import { DEFAULT_SETTINGS, useSettings, type LayoutView } from "../settings";

const BoardContext = createContext<LayoutView | null>(null);

/** Padding and border of the card around the wheel, both sides together. */
const WHEEL_CARD = 18;

type BoardProps = {
  /** The view type whose open and closed boxes are remembered together. */
  view: LayoutView;
  /** The wheel, given the room it may take. It never moves or changes size with the boxes. */
  wheel: (room: Size) => ReactNode;
  /** The boxes (`Box`), in the order they are placed. */
  children: ReactNode;
};

/**
 * A chart view's wheel with its information boxes around it (change
 * specification of 16 November 2026). The wheel is always visible at the
 * top left and is sized by the window alone. The boxes are placed beside
 * and under it wherever there is room highest up, and are placed again
 * whenever one is opened or closed, so no large empty areas are left.
 */
export function PanelBoard({ view, wheel, children }: BoardProps) {
  const board = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Size>({ width: 900, height: 800 });

  const layout = useCallback(() => {
    const element = board.current;
    if (!element) return;
    const width = element.clientWidth;
    const top = element.getBoundingClientRect().top + window.scrollY;
    const next = wheelRoom(width, top, window.innerHeight, window.innerWidth > 1000);
    next.width -= WHEEL_CARD;
    next.height -= WHEEL_CARD;
    setRoom((current) =>
      current.width === next.width && current.height === next.height ? current : next,
    );

    const wheelSize = slot.current
      ? { width: slot.current.offsetWidth, height: slot.current.offsetHeight }
      : null;
    let columns = boardColumns(width, wheelSize);
    // In a window too narrow for a column beside the wheel, the pinned box
    // (the time navigation) goes above the wheel rather than far below it.
    const pinned = element.querySelector<HTMLElement>(":scope > [data-pinned]");
    let above = 0;
    if (wheelSize && pinned && !columns.some((column) => column.set === "side")) {
      pinned.style.width = `${width}px`;
      pinned.style.left = "0px";
      pinned.style.top = "0px";
      above = pinned.offsetHeight + GAP;
      columns = boardColumns(width, { width: wheelSize.width, height: wheelSize.height + above });
    }
    if (slot.current) slot.current.style.top = `${above}px`;
    let bottom = (wheelSize?.height ?? 0) + above;
    for (const box of element.querySelectorAll<HTMLElement>(":scope > [data-box]")) {
      if (above && box === pinned) continue;
      const wanted = box.dataset.span;
      const span: Span = wanted === "side" ? "side" : wanted === "wide" ? WIDE_BOX : 0;
      const choice = chooseColumns(columns, span);
      const frame = boxFrame(columns, choice);
      // The height of a box follows from its width, so the width goes first.
      box.style.width = `${frame.width}px`;
      box.style.left = `${frame.x}px`;
      box.style.top = `${frame.y}px`;
      const height = box.offsetHeight;
      fillColumns(columns, choice, frame.y, height);
      bottom = Math.max(bottom, frame.y + height);
    }
    element.style.height = `${bottom}px`;
  }, []);

  // After every render of the view, and whenever a box changes size, appears
  // or goes away (a box that opens or closes renders itself, not the board).
  useLayoutEffect(layout);
  useEffect(() => {
    const element = board.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const sizes = new ResizeObserver(layout);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(element);
      for (const child of element.children) sizes.observe(child);
    };
    watch();
    const children = new MutationObserver(() => {
      watch();
      layout();
    });
    children.observe(element, { childList: true });
    window.addEventListener("resize", layout);
    return () => {
      sizes.disconnect();
      children.disconnect();
      window.removeEventListener("resize", layout);
    };
  }, [layout]);

  return (
    <BoardContext.Provider value={view}>
      <div className="panel-board" ref={board}>
        <div className="board-wheel" ref={slot}>
          <div className="wheel-column">{wheel(room)}</div>
        </div>
        {children}
      </div>
    </BoardContext.Provider>
  );
}

type BoxProps = {
  /** Name the open or closed state is remembered under, within the view type. */
  id: string;
  title: ReactNode;
  /**
   * The width the box asks for while open: one column, room for wide
   * contents (two columns where one is too narrow), or all the columns
   * beside the wheel.
   */
  span?: "column" | "wide" | "side";
  /** Controls shown in the heading while the box is open. */
  actions?: ReactNode;
  /** A box that is always open and has no heading. */
  fixed?: boolean;
  /** Stands above the wheel where there is no room beside it. */
  pinned?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * An information box that can be folded together and opened on its own.
 * Which boxes are open is remembered per view type, not per chart.
 */
export function Box({ id, title, span = "column", actions, fixed = false, pinned = false, className, children }: BoxProps) {
  const view = useContext(BoardContext);
  const { settings, update } = useSettings();
  const open = fixed || view === null || (settings.layout[view][id] ?? true);
  const toggle = () => {
    if (view === null) return;
    update((s) => ({
      ...s,
      layout: { ...s.layout, [view]: { ...s.layout[view], [id]: !open } },
    }));
  };

  return (
    <section
      className={`panel box${open ? "" : " closed"}${className ? ` ${className}` : ""}`}
      data-box={id}
      data-span={open ? span : "column"}
      data-pinned={pinned || undefined}
    >
      {!fixed && (
        <div className="box-head">
          <h2>
            <button
              className="box-toggle"
              aria-expanded={open}
              title={open ? "Klap sammen" : "Åbn"}
              onClick={toggle}
            >
              <span className="box-arrow" aria-hidden="true">
                {open ? "▾" : "▸"}
              </span>
              {title}
            </button>
          </h2>
          {open && actions}
        </div>
      )}
      {open && children}
    </section>
  );
}

/** "Nulstil layout": the standard open and closed boxes of one view type. Touches nothing else. */
export function ResetLayoutButton({ view }: { view: LayoutView }) {
  const { update } = useSettings();
  return (
    <button
      title="Åbner og lukker informationskasserne som fra start. Horoskopdata, farver og øvrige indstillinger ændres ikke."
      onClick={() =>
        update((s) => ({ ...s, layout: { ...s.layout, [view]: DEFAULT_SETTINGS.layout[view] } }))
      }
    >
      Nulstil layout
    </button>
  );
}
