// Side-by-side lanes for blocks that overlap (SCREENS.md §4 "side by side on
// overlap"): every block in a cluster of mutually overlapping blocks gets its
// own column, so each stays a real target rather than one covering the next.
// Pure; the timeline turns a lane into left/width.

export interface Lane {
  column: number;
  columns: number;
}

interface Span {
  id: string;
  start: number;
  end: number;
}

export function layoutLanes(blocks: readonly Span[]): Map<string, Lane> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const lanes = new Map<string, Lane>();
  let cluster: { id: string; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const n = Math.max(1, columnEnds.length);
    for (const c of cluster) lanes.set(c.id, { column: c.column, columns: n });
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= b.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(b.end);
    } else {
      columnEnds[column] = b.end;
    }
    cluster.push({ id: b.id, column });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return lanes;
}
