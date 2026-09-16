/**
 * lib/color/concreteness: the length and marker heuristic that decides whether a written answer
 * is concrete, unsure (ask the model) or abstract, with the default thresholds
 * (fail below 25 chars, pass at or above 140 chars with a marker, two marker hits pass at any length).
 */
import { describe, expect, it } from "vitest";
import { assessConcreteness, DEFAULT_CONCRETENESS_CONFIG, markerHits } from "@/lib/color/concreteness";

describe("DEFAULT_CONCRETENESS_CONFIG", () => {
  it("has the documented thresholds", () => {
    expect(DEFAULT_CONCRETENESS_CONFIG).toEqual({ fail_below_chars: 25, pass_at_or_above_chars: 140, pass_marker_hits: 2 });
  });
});

describe("assessConcreteness", () => {
  it("fails below 25 characters even when markers are present", () => {
    const short = "Yesterday my son cried.";
    expect(short.length).toBeLessThan(25);
    const res = assessConcreteness(short);
    expect(res.verdict).toBe("fail");
    expect(res.hits.count).toBeGreaterThanOrEqual(2);
    expect(assessConcreteness("We just talk.").verdict).toBe("fail");
    expect(assessConcreteness("                    ").verdict).toBe("fail");
  });

  it("fails at mid length with no markers", () => {
    const text = "We try to be respectful and communicate openly about things.";
    expect(text.length).toBeGreaterThanOrEqual(25);
    expect(text.length).toBeLessThan(140);
    const res = assessConcreteness(text);
    expect(res.hits.count).toBe(0);
    expect(res.verdict).toBe("fail");
  });

  it("passes with two markers at mid length", () => {
    const text = "Yesterday my daughter asked me to help with the shelf.";
    const res = assessConcreteness(text);
    expect(res.hits.count).toBeGreaterThanOrEqual(2);
    expect(res.verdict).toBe("pass");
  });

  it("passes with one marker at or above 140 characters", () => {
    const text =
      "For example, we keep a shared list on the fridge and whoever has the lighter day handles the errands, and we check the list together every evening so nothing slips through.";
    expect(text.length).toBeGreaterThanOrEqual(140);
    const res = assessConcreteness(text);
    expect(res.hits).toMatchObject({ explicit: true, count: 1 });
    expect(res.verdict).toBe("pass");
  });

  it("is unsure with one marker at mid length", () => {
    const text = "For example, we keep a shared list on the fridge.";
    expect(text.length).toBeGreaterThanOrEqual(25);
    expect(text.length).toBeLessThan(140);
    const res = assessConcreteness(text);
    expect(res.hits.count).toBe(1);
    expect(res.verdict).toBe("unsure");
  });

  it("at or above 140 characters with no marker is unsure (the length rule only fails short marker-less answers)", () => {
    const text = "We believe in mutual respect and in communicating openly and honestly about our needs and values as a family, and we keep working on it together over the years.";
    expect(text.length).toBeGreaterThanOrEqual(140);
    const res = assessConcreteness(text);
    expect(res.hits.count).toBe(0);
    expect(res.verdict).toBe("unsure");
  });

  it("trims before measuring and reports the trimmed length", () => {
    const res = assessConcreteness("   We just talk.   ");
    expect(res.length).toBe("We just talk.".length);
  });

  it("honours a custom config", () => {
    const cfg = { fail_below_chars: 5, pass_at_or_above_chars: 30, pass_marker_hits: 1 };
    expect(assessConcreteness("For example, no.", cfg).verdict).toBe("pass");
    expect(assessConcreteness("Nope", cfg).verdict).toBe("fail");
  });
});

describe("markerHits", () => {
  it("detects a time reference on its own", () => {
    expect(markerHits("Yesterday we do the dishes together.")).toEqual({ time: true, person: false, past_tense: false, explicit: false, count: 1 });
  });

  it("detects a role such as 'my daughter' on its own", () => {
    expect(markerHits("Usually my daughter helps with the dishes.")).toEqual({ time: false, person: true, past_tense: false, explicit: false, count: 1 });
  });

  it("detects a past-tense narrative verb on its own", () => {
    expect(markerHits("We argued and then apologized.")).toEqual({ time: false, person: false, past_tense: true, explicit: false, count: 1 });
  });

  it("detects an explicit marker such as 'for example' on its own", () => {
    expect(markerHits("For example we split the chores.")).toEqual({ time: false, person: false, past_tense: false, explicit: true, count: 1 });
  });

  it("detects a capitalized name followed by a narrative verb as a person", () => {
    const hits = markerHits("Maria said she would take the morning shift.");
    expect(hits.person).toBe(true);
    expect(hits.past_tense).toBe(true);
  });

  it("counts each marker family once", () => {
    const hits = markerHits("Last week my partner said, for example, that at 7pm she walked out. Yesterday she came back.");
    expect(hits).toEqual({ time: true, person: true, past_tense: true, explicit: true, count: 4 });
  });
});
