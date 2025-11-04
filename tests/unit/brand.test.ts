import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/brand";

describe("brand", () => {
  it("exports one non-empty display name", () => {
    expect(PRODUCT_NAME).toMatch(/\S/);
  });
});
