import { describe, expect, it } from "vitest";
import { GAP, WIDE_BOX, boardColumns, boxFrame, chooseColumns, fillColumns, wheelRoom, type Span } from "./panelLayout";

/** Places boxes of the given spans and heights in order; returns their frames. */
function place(width: number, wheel: { width: number; height: number } | null, boxes: [Span, number][]) {
  const columns = boardColumns(width, wheel);
  return boxes.map(([span, height]) => {
    const choice = chooseColumns(columns, span);
    const frame = boxFrame(columns, choice);
    fillColumns(columns, choice, frame.y, height);
    return frame;
  });
}

describe("boardColumns", () => {
  it("puts one set beside the wheel from the top and one under it", () => {
    const columns = boardColumns(1872, { width: 1000, height: 900 });
    const side = columns.filter((c) => c.set === "side");
    const under = columns.filter((c) => c.set === "under");
    expect(side).toHaveLength(2);
    expect(under).toHaveLength(2);
    expect(side[0]).toMatchObject({ x: 1000 + GAP, y: 0 });
    expect(side[1].x + side[1].width).toBeCloseTo(1872);
    expect(under[0]).toMatchObject({ x: 0, y: 900 + GAP });
    expect(under[1].x + under[1].width).toBeCloseTo(1000);
  });

  it("uses the whole width under the wheel when there is no room beside it", () => {
    const columns = boardColumns(1100, { width: 1000, height: 900 });
    expect(columns.every((c) => c.set === "under" && c.y === 900 + GAP)).toBe(true);
    expect(columns[columns.length - 1].x + columns[columns.length - 1].width).toBeCloseTo(1100);
  });

  it("is plain columns without a wheel", () => {
    expect(boardColumns(1200, null)).toHaveLength(3);
  });
});

describe("placing boxes", () => {
  const wheel = { width: 1000, height: 900 };

  it("fills the room beside the wheel before going under it", () => {
    // One column beside the wheel.
    const frames = place(1500, wheel, [
      [0, 400],
      [0, 400],
      [0, 400],
    ]);
    expect(frames[0]).toMatchObject({ x: 1000 + GAP, y: 0 });
    expect(frames[1]).toMatchObject({ x: 1000 + GAP, y: 400 + GAP });
    // The third would start at 828, above the wheel's lower edge, so it stays beside.
    expect(frames[2]).toMatchObject({ x: 1000 + GAP, y: 828 });
  });

  it("moves a later box up when an earlier one is closed", () => {
    const open = place(1500, wheel, [
      [0, 950],
      [0, 300],
    ]);
    // Beside the wheel is filled past its lower edge: the next box goes under the wheel.
    expect(open[1]).toMatchObject({ x: 0, y: 900 + GAP });
    const closed = place(1500, wheel, [
      [0, 50],
      [0, 300],
    ]);
    expect(closed[1]).toMatchObject({ x: 1000 + GAP, y: 50 + GAP });
  });

  it("gives a wide box two columns where one is too narrow", () => {
    // Beside the wheel is one column of 486, under it two of 493.
    const frames = place(1500, wheel, [[WIDE_BOX, 300]]);
    expect(frames[0]).toMatchObject({ x: 0, y: 900 + GAP, width: 1000 });
  });

  it("lets a wide box stand in one column that is wide enough", () => {
    // Beside the wheel is one column of 586.
    const frames = place(1600, wheel, [
      [WIDE_BOX, 300],
      [WIDE_BOX, 300],
    ]);
    expect(frames[0]).toMatchObject({ x: 1000 + GAP, y: 0, width: 586 });
    expect(frames[1]).toMatchObject({ x: 1000 + GAP, y: 300 + GAP });
  });

  it("narrows a wide box where nothing is wide enough", () => {
    const frames = place(500, null, [[WIDE_BOX, 300]]);
    expect(frames[0]).toMatchObject({ x: 0, y: 0, width: 500 });
  });

  it("lets a box take all the columns beside the wheel", () => {
    const frames = place(1872, wheel, [
      ["side", 100],
      [0, 200],
      [0, 200],
    ]);
    expect(frames[0].x).toBe(1000 + GAP);
    expect(frames[0].width).toBeCloseTo(1872 - 1000 - GAP);
    expect(frames[1].y).toBe(100 + GAP);
    expect(frames[2].y).toBe(100 + GAP);
    expect(frames[2].x).toBeGreaterThan(frames[1].x);
  });

  it("never moves the columns under the wheel above its lower edge", () => {
    const frames = place(1872, wheel, Array.from({ length: 12 }, () => [0, 250] as [Span, number]));
    for (const frame of frames) {
      if (frame.x < 1000) expect(frame.y).toBeGreaterThanOrEqual(900 + GAP);
    }
  });
});

describe("wheelRoom", () => {
  it("leaves a column free beside the wheel on a wide board and fits the window's height", () => {
    expect(wheelRoom(1872, 100, 1000, true)).toEqual({ width: 1872 - 380 - GAP, height: 1000 - 100 - GAP });
  });

  it("takes the whole width on a narrow board", () => {
    expect(wheelRoom(900, 100, 1000, false).width).toBe(900);
    expect(wheelRoom(1000, 100, 1000, true).width).toBe(1000);
  });
});
