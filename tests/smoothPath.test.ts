import { describe, it, expect } from "vitest";
import { smoothPath } from "../src/lib/smoothPath";

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
