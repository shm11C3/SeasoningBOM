import { describe, expect, it } from "vitest";
import { fixedNow, makeInventoryItem } from "../../test/factories/domainFactories";
import { calculateLifecycleStatus, daysUntilDateKey } from "./calculateLifecycleStatus";

describe("calculateLifecycleStatus", () => {
  it("treats best-before on the same day as not EOL", () => {
    const status = calculateLifecycleStatus({
      item: makeInventoryItem({ bestBeforeDate: "2026-07-01" }),
      now: fixedNow,
      deprecatedThresholdDays: 3,
    });

    expect(status).toBe("deprecated");
  });

  it("marks best-before dates before today as EOL", () => {
    const status = calculateLifecycleStatus({
      item: makeInventoryItem({ bestBeforeDate: "2026-06-30" }),
      now: fixedNow,
      deprecatedThresholdDays: 3,
    });

    expect(status).toBe("eol");
  });

  it("marks use-by dates before today as unsupported", () => {
    const status = calculateLifecycleStatus({
      item: makeInventoryItem({ bestBeforeDate: "2026-07-10", useByDate: "2026-06-30" }),
      now: fixedNow,
      deprecatedThresholdDays: 3,
    });

    expect(status).toBe("unsupported");
  });

  it("prioritizes hazardous over every date rule", () => {
    const status = calculateLifecycleStatus({
      item: makeInventoryItem({ hazardous: true, useByDate: "2026-06-30" }),
      now: fixedNow,
      deprecatedThresholdDays: 3,
    });

    expect(status).toBe("hazardous");
  });

  it("uses the deprecated threshold for upcoming EOL", () => {
    expect(
      calculateLifecycleStatus({
        item: makeInventoryItem({ bestBeforeDate: "2026-07-04" }),
        now: fixedNow,
        deprecatedThresholdDays: 3,
      }),
    ).toBe("deprecated");

    expect(
      calculateLifecycleStatus({
        item: makeInventoryItem({ bestBeforeDate: "2026-07-05" }),
        now: fixedNow,
        deprecatedThresholdDays: 3,
      }),
    ).toBe("active");
  });

  it("returns null when date keys cannot be compared", () => {
    expect(daysUntilDateKey(undefined, "2026-07-01")).toBeNull();
    expect(daysUntilDateKey("2026-07-02", "not-a-date")).toBeNull();
  });
});
