// Compact org-chart layout, as a pure function. Branches spread side by side; a group of
// siblings that have nothing under them is stacked in a column under their parent, which is
// what keeps a wide organization readable (same idea as the reference org chart). A node can
// instead ask for its children in rows beside it, which suits an ordered sequence.

export const NODE_W = 236;
export const NODE_H = 122;
const GAP_X = 30;
const GAP_Y = 68;
const STACK_GAP = 14;
const STACK_INDENT = 36;
const STACK_DROP = 30;
const ROW_SIZE = 5;
const ROW_GAP_X = 40;
const ROW_GAP_Y = 56;

export interface ChartInput {
  id: string;
  /** Only the children currently shown: a collapsed node passes none. */
  children: ChartInput[];
  /** Children run left to right beside the node, wrapping into rows, instead of hanging below it. */
  row?: boolean;
}
/** How the connector reaches a card: from above, into its side from a stacked column, from the previous card of its row, or from the end of the row above. */
export type Entry = 'top' | 'side' | 'next' | 'wrap';
export interface Placed {
  id: string;
  x: number;
  y: number;
  /** Card the connector comes from: the parent, or the previous card of a row. */
  fromId: string | null;
  entry: Entry;
}

interface Box {
  width: number;
  height: number;
  /** Offset of the node's own left edge inside its box. */
  anchor: number;
  place: (x: number, y: number, out: Placed[], fromId: string | null, entry: Entry) => void;
}

const isRow = (node: ChartInput) => Boolean(node.row) && node.children.length > 0;

function measure(node: ChartInput): Box {
  const kids = node.children;
  if (!kids.length) {
    return { width: NODE_W, height: NODE_H, anchor: 0, place: (x, y, out, fromId, entry) => out.push({ id: node.id, x, y, fromId, entry }) };
  }
  const boxes = kids.map(measure);
  if (node.row) {
    const rows: Box[][] = [];
    for (let start = 0; start < boxes.length; start += ROW_SIZE) rows.push(boxes.slice(start, start + ROW_SIZE));
    const left = NODE_W + ROW_GAP_X;
    const rowWidth = (row: Box[]) => row.reduce((sum, box) => sum + box.width, 0) + (row.length - 1) * ROW_GAP_X;
    const rowHeight = (row: Box[]) => Math.max(...row.map((box) => box.height));
    return {
      width: left + Math.max(...rows.map(rowWidth)),
      height: rows.reduce((sum, row) => sum + rowHeight(row), 0) + (rows.length - 1) * ROW_GAP_Y,
      anchor: 0,
      place: (x, y, out, fromId, entry) => {
        out.push({ id: node.id, x, y, fromId, entry });
        let previous = node.id;
        let top = y;
        rows.forEach((row, rowIndex) => {
          let cursor = x + left;
          row.forEach((box, index) => {
            const kid = kids[rowIndex * ROW_SIZE + index]!;
            box.place(cursor, top, out, previous, rowIndex > 0 && index === 0 ? 'wrap' : 'next');
            previous = kid.id;
            cursor += box.width + ROW_GAP_X;
          });
          top += rowHeight(row) + ROW_GAP_Y;
        });
      },
    };
  }
  if (kids.length > 1 && kids.every((kid) => !kid.children.length || kid.row)) {
    // Rows are taller than a card, so they get more air above and below than plain stacked cards.
    const tops: number[] = [];
    let bottom = NODE_H + STACK_DROP - STACK_GAP;
    boxes.forEach((box, index) => {
      const wide = isRow(kids[index]!) || (index > 0 && isRow(kids[index - 1]!));
      tops.push(bottom + (index > 0 && wide ? ROW_GAP_Y : STACK_GAP));
      bottom = tops[index]! + box.height;
    });
    return {
      width: STACK_INDENT + Math.max(...boxes.map((box) => box.width)),
      height: bottom,
      anchor: 0,
      place: (x, y, out, fromId, entry) => {
        out.push({ id: node.id, x, y, fromId, entry });
        boxes.forEach((box, index) => box.place(x + STACK_INDENT, y + tops[index]!, out, node.id, 'side'));
      },
    };
  }
  const offsets: number[] = [];
  let cursor = 0;
  for (const box of boxes) {
    offsets.push(cursor);
    cursor += box.width + GAP_X;
  }
  // The parent is centred over its first and last child nodes, not over their whole boxes.
  const first = offsets[0]! + boxes[0]!.anchor;
  const last = offsets[offsets.length - 1]! + boxes[boxes.length - 1]!.anchor;
  const anchor = (first + last) / 2;
  return {
    width: Math.max(cursor - GAP_X, anchor + NODE_W),
    height: NODE_H + GAP_Y + Math.max(...boxes.map((box) => box.height)),
    anchor,
    place: (x, y, out, fromId, entry) => {
      out.push({ id: node.id, x: x + anchor, y, fromId, entry });
      boxes.forEach((box, index) => box.place(x + offsets[index]!, y + NODE_H + GAP_Y, out, node.id, 'top'));
    },
  };
}

/** Positions every shown node. Several roots are laid out side by side. */
export function layoutChart(roots: ChartInput[]): Placed[] {
  const placed: Placed[] = [];
  let x = 0;
  for (const root of roots) {
    const box = measure(root);
    box.place(x, 0, placed, null, 'top');
    x += box.width + GAP_X * 2;
  }
  return placed;
}
