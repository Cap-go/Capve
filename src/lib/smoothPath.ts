/**
 * Monotone cubic interpolation (Fritsch-Carlson) - never overshoots local min/max.
 * Based on d3.curveMonotoneX algorithm.
 */
export function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  
  const n = points.length;
  
  // Compute slopes (finite differences)
  const dxs: number[] = [];
  const dys: number[] = [];
  const ms: number[] = [];
  
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    dxs.push(dx);
    dys.push(dy);
    ms.push(dy / dx);
  }
  
  // Compute tangents (Fritsch-Carlson)
  const tangents: number[] = [ms[0]];
  for (let i = 1; i < n - 1; i++) {
    const m0 = ms[i - 1];
    const m1 = ms[i];
    if (m0 * m1 <= 0) {
      tangents.push(0); // Local extremum
    } else {
      const dx0 = dxs[i - 1];
      const dx1 = dxs[i];
      const common = dx0 + dx1;
      tangents.push(3 * common / ((common + dx1) / m0 + (common + dx0) / m1));
    }
  }
  tangents.push(ms[n - 2]);
  
  // Build path with monotone cubic segments
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = dxs[i];
    const m0 = tangents[i];
    const m1 = tangents[i + 1];
    
    const c1x = x0 + dx / 3;
    const c1y = y0 + m0 * dx / 3;
    const c2x = x1 - dx / 3;
    const c2y = y1 - m1 * dx / 3;
    
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  
  return d;
}
