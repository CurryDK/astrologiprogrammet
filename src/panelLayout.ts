// Where the information boxes of a chart view go (change specification of
// 16 November 2026): the wheel stands still at the top left, and the boxes
// fill the columns beside it and under it, each going where there is room
// highest up. Pure geometry; `PanelBoard` measures and applies it.

/** Space between boxes, in pixels. */
export const GAP = 14;
/** Narrowest a column of boxes may be. */
export const MIN_COLUMN = 380;
/** Below this width the room beside the wheel is not used as a column. */
const MIN_SIDE = 300;

export type Size = { width: number; height: number };

/** One column of boxes: where it is, and how far down it is filled. */
export type Column = { set: "under" | "side"; x: number; width: number; y: number };

/** Narrowest a box with wide contents (a matrix, a timeline) may be. */
export const WIDE_BOX = 520;

/**
 * What a box asks for: the least width it needs in pixels (0: one column
 * will do), or all the columns beside the wheel.
 */
export type Span = number | "side";

function columnsIn(set: Column["set"], x: number, width: number, y: number): Column[] {
  const count = Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN + GAP)));
  const columnWidth = (width - GAP * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    set,
    x: x + index * (columnWidth + GAP),
    width: columnWidth,
    y,
  }));
}

/**
 * The columns of a board `width` wide. With a wheel there are two sets:
 * those beside it, which start at the top, and those under it. Where the
 * room beside the wheel is too narrow, everything goes under it.
 */
export function boardColumns(width: number, wheel: Size | null): Column[] {
  if (!wheel) return columnsIn("under", 0, width, 0);
  const sideWidth = width - wheel.width - GAP;
  const below = wheel.height + GAP;
  if (sideWidth < MIN_SIDE) return columnsIn("under", 0, width, below);
  return [
    ...columnsIn("side", wheel.width + GAP, sideWidth, 0),
    ...columnsIn("under", 0, wheel.width, below),
  ];
}

/** The neighbouring columns a box takes: index of the first, and how many. */
export function chooseColumns(columns: Column[], span: Span): { first: number; count: number } {
  const sets = (["side", "under"] as const)
    .map((set) => {
      const first = columns.findIndex((column) => column.set === set);
      return { first, count: columns.filter((column) => column.set === set).length };
    })
    .filter((set) => set.count > 0);
  if (span === "side") return sets[0];

  // In each set, as few columns as give the box the width it needs.
  const options = sets.map((set) => {
    const { width } = columns[set.first];
    const needed = Math.max(1, Math.ceil((span + GAP) / (width + GAP)));
    return { ...set, take: Math.min(needed, set.count), wideEnough: needed <= set.count };
  });
  // A wide box only goes where it can be wide; if nowhere, anywhere, as wide as it gets.
  const usable = options.some((set) => set.wideEnough)
    ? options.filter((set) => set.wideEnough)
    : options;
  let best = { first: usable[0].first, count: usable[0].take, top: Infinity };
  for (const set of usable) {
    for (let first = set.first; first + set.take <= set.first + set.count; first++) {
      const top = Math.max(...columns.slice(first, first + set.take).map((column) => column.y));
      if (top < best.top) best = { first, count: set.take, top };
    }
  }
  return { first: best.first, count: best.count };
}

/** Position and width of a box in the chosen columns. */
export function boxFrame(columns: Column[], choice: { first: number; count: number }) {
  const taken = columns.slice(choice.first, choice.first + choice.count);
  const last = taken[taken.length - 1];
  return {
    x: taken[0].x,
    y: Math.max(...taken.map((column) => column.y)),
    width: last.x + last.width - taken[0].x,
  };
}

/** Marks the chosen columns as filled by a box of `height` standing at `y`. */
export function fillColumns(
  columns: Column[],
  choice: { first: number; count: number },
  y: number,
  height: number,
): void {
  for (let index = choice.first; index < choice.first + choice.count; index++) {
    columns[index].y = y + height + GAP;
  }
}

/**
 * The room a wheel may take on a board `width` wide whose top is `top`
 * pixels below the top of a window `windowHeight` high: the whole wheel is
 * to be visible without scrolling, and on a wide board one column is left
 * free beside it.
 */
export function wheelRoom(width: number, top: number, windowHeight: number, wide: boolean): Size {
  const beside = width - MIN_COLUMN - GAP;
  return {
    width: Math.round(wide && beside >= 2 * MIN_COLUMN ? beside : width),
    height: Math.round(windowHeight - top - GAP),
  };
}
