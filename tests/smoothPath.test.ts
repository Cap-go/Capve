import { describe, it, expect } from "vitest";

/**
 * Monotone cubic interpolation (Fritsch-Carlson) - never overshoots local min/max.
 * Based on d3.curveMonotoneX algorithm.
 */
function smoothPath(points: Array<[number, number]>): string {
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

/**
 * Parse SVG path and extract all Y coordinates (control points and endpoints).
 */
function extractYCoordinates(path: string): number[] {
  const coords: number[] = [];
  // Match M x y and C x1 y1, x2 y2, x y patterns
  const moveMatch = path.match(/M\s+([\d.-]+)\s+([\d.-]+)/);
  if (moveMatch) coords.push(parseFloat(moveMatch[2]));
  
  const curveMatches = path.matchAll(/C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)/g);
  for (const match of curveMatches) {
    coords.push(parseFloat(match[2])); // c1y
    coords.push(parseFloat(match[4])); // c2y
    coords.push(parseFloat(match[6])); // y
  }
  
  return coords;
}

describe("smoothPath monotone cubic interpolation", () => {
  it("never overshoots data min/max", () => {
    // Test data with peaks and valleys
    const points: Array<[number, number]> = [
      [0, 100],
      [100, 50],
      [200, 150],
      [300, 80],
      [400, 120],
    ];
    
    const dataMin = Math.min(...points.map(p => p[1]));
    const dataMax = Math.max(...points.map(p => p[1]));
    
    const path = smoothPath(points);
    const yCoords = extractYCoordinates(path);
    
    // All Y coordinates (including control points) should stay within [dataMin, dataMax]
    for (const y of yCoords) {
      expect(y).toBeGreaterThanOrEqual(dataMin);
      expect(y).toBeLessThanOrEqual(dataMax);
    }
  });
  
  it("handles monotonic increasing data", () => {
    const points: Array<[number, number]> = [
      [0, 10],
      [100, 20],
      [200, 30],
      [300, 40],
    ];
    
    const path = smoothPath(points);
    const yCoords = extractYCoordinates(path);
    
    // All Y values should stay between 10 and 40
    for (const y of yCoords) {
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(40);
    }
  });
  
  it("handles data with zero values (non-negative constraint)", () => {
    const points: Array<[number, number]> = [
      [0, 5],
      [100, 0],
      [200, 10],
      [300, 0],
    ];
    
    const path = smoothPath(points);
    const yCoords = extractYCoordinates(path);
    
    // All Y values should stay non-negative
    for (const y of yCoords) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
  });
  
  it("produces valid SVG path for single point", () => {
    const points: Array<[number, number]> = [[100, 50]];
    const path = smoothPath(points);
    expect(path).toBe("M 100.00 50.00");
  });
  
  it("produces valid SVG path for two points", () => {
    const points: Array<[number, number]> = [[0, 100], [200, 50]];
    const path = smoothPath(points);
    expect(path).toContain("M 0.00 100.00");
    expect(path).toContain("C ");
  });
});
