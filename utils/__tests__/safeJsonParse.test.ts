jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import { safeJsonParse } from "../storage";

describe("safeJsonParse", () => {
  const fallback = { default: true };

  it("returns fallback for null input", () => {
    expect(safeJsonParse(null, fallback)).toBe(fallback);
  });

  it("returns fallback for empty string", () => {
    expect(safeJsonParse("", fallback)).toBe(fallback);
  });

  it("returns fallback for malformed JSON", () => {
    expect(safeJsonParse("{bad json", fallback)).toBe(fallback);
  });

  it("returns parsed object for valid JSON object", () => {
    expect(safeJsonParse('{"a":1}', fallback)).toEqual({ a: 1 });
  });

  it("returns parsed array for valid JSON array", () => {
    expect(safeJsonParse("[1,2,3]", [])).toEqual([1, 2, 3]);
  });

  it("returns parsed primitive for valid JSON number", () => {
    expect(safeJsonParse("42", 0)).toBe(42);
  });
});
