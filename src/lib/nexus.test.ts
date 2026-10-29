import { describe, expect, it } from "vitest";
import { canCreateCommunity } from "./nexus";

describe("community creation rule", () => {
  it("allows any account, regardless of age", () => {
    expect(canCreateCommunity()).toBe(true);
  });
});
