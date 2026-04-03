import { roomVariant, roomGlobePos } from "../roomVisuals";

describe("roomVariant", () => {
  it("returns a number in range 0-7", () => {
    for (const code of ["ABC", "ZZZZ", "a", "123456"]) {
      const v = roomVariant(code);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("is deterministic for the same code", () => {
    expect(roomVariant("SUNSET")).toBe(roomVariant("SUNSET"));
  });

  it("can produce different variants for different codes", () => {
    // Not all codes map to the same variant
    const variants = new Set(["AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"].map(roomVariant));
    expect(variants.size).toBeGreaterThan(1);
  });

  it("returns 5 for ABCDEF (known value)", () => {
    // 65+66+67+68+69+70 = 405, 405 % 8 = 5
    expect(roomVariant("ABCDEF")).toBe(5);
  });
});

describe("roomGlobePos", () => {
  it("returns object with lon and lat as numbers", () => {
    const pos = roomGlobePos("TEST");
    expect(typeof pos.lon).toBe("number");
    expect(typeof pos.lat).toBe("number");
  });

  it("is deterministic for the same code", () => {
    const a = roomGlobePos("SUNSET");
    const b = roomGlobePos("SUNSET");
    expect(a.lon).toBe(b.lon);
    expect(a.lat).toBe(b.lat);
  });

  it("returns correct known values for ABCDEF", () => {
    // sum = 405
    const expectedLon = ((405 * 137.508) % 360) * (Math.PI / 180);
    const expectedLat = (((405 * 67.1) % 60) - 30) * (Math.PI / 180);
    const pos = roomGlobePos("ABCDEF");
    expect(pos.lon).toBeCloseTo(expectedLon, 10);
    expect(pos.lat).toBeCloseTo(expectedLat, 10);
  });
});
