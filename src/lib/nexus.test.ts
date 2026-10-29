import { describe, expect, it } from "vitest";
import { canCreateCommunity } from "./nexus";

describe("community creation rule", () => {
  const created = "2026-10-01T12:00:00Z";
  it("blocks accounts younger than 2 days", () => {
    expect(canCreateCommunity(created, new Date("2026-10-03T11:59:00Z").getTime())).toBe(false);
  });
  it("allows accounts 2 days old", () => {
    expect(canCreateCommunity(created, new Date("2026-10-03T12:00:00Z").getTime())).toBe(true);
  });
});
