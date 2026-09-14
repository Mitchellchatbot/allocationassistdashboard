/**
 * Sorting rules for the Reports tables.
 *
 * The comparator is the part worth pinning down: every table on the page feeds
 * it a mix of numbers, strings and nulls (an em-dash cell, a hospital that was
 * never contacted), and the rule is that nulls SINK regardless of direction —
 * an empty cell isn't "the smallest value", it's no value. Get that backwards
 * and flipping a column to ascending fills the top of the table with blanks.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSort } from "@/components/reports/sortable";

interface Row { name: string; signed: number | null }

const rows: Row[] = [
  { name: "Burjeel", signed: 3 },
  { name: "Aster",   signed: null },
  { name: "NMC",     signed: 7 },
  { name: "Zulekha", signed: 1 },
];

const names = (rs: Row[]) => rs.map(r => r.name);
const value = (r: Row, key: "name" | "signed") => (key === "name" ? r.name : r.signed);

describe("useSort", () => {
  it("starts a numeric column high → low", () => {
    const { result } = renderHook(() => useSort<"name" | "signed">("signed"));
    expect(names(result.current.sort(rows, value))).toEqual(["NMC", "Burjeel", "Zulekha", "Aster"]);
  });

  it("sinks nulls to the bottom in BOTH directions", () => {
    const { result } = renderHook(() => useSort<"name" | "signed">("signed"));
    act(() => result.current.toggle("signed"));          // flip to ascending
    expect(result.current.dir).toBe("asc");
    const sorted = names(result.current.sort(rows, value));
    expect(sorted).toEqual(["Zulekha", "Burjeel", "NMC", "Aster"]);
    expect(sorted[sorted.length - 1]).toBe("Aster");     // still last, not first
  });

  it("starts a text column A → Z, not Z → A", () => {
    const { result } = renderHook(() => useSort<"name" | "signed">("signed"));
    act(() => result.current.toggle("name", false));
    expect(result.current.dir).toBe("asc");
    expect(names(result.current.sort(rows, value))).toEqual(["Aster", "Burjeel", "NMC", "Zulekha"]);
  });

  it("flips direction when the active column is clicked again", () => {
    const { result } = renderHook(() => useSort<"name" | "signed">("signed"));
    act(() => result.current.toggle("signed"));
    act(() => result.current.toggle("signed"));
    expect(result.current.dir).toBe("desc");
    expect(result.current.key).toBe("signed");
  });

  it("resets direction rather than keeping it when switching columns", () => {
    const { result } = renderHook(() => useSort<"name" | "signed">("signed"));
    act(() => result.current.toggle("signed"));          // signed, asc
    act(() => result.current.toggle("name", false));     // text column → asc
    expect(result.current.dir).toBe("asc");
    act(() => result.current.toggle("signed", true));    // numeric column → desc
    expect(result.current.dir).toBe("desc");
  });

  it("does not mutate the array it was given", () => {
    const { result } = renderHook(() => useSort<"name" | "signed">("signed"));
    const input = [...rows];
    result.current.sort(input, value);
    expect(names(input)).toEqual(names(rows));
  });
});
