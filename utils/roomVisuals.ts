export function roomVariant(code: string): number {
  return code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 8;
}

export function roomGlobePos(code: string): { lon: number; lat: number } {
  const sum = code.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    lon: ((sum * 137.508) % 360) * (Math.PI / 180),
    lat: (((sum * 67.1) % 60) - 30) * (Math.PI / 180),
  };
}

