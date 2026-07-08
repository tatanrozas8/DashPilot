import { describe, expect, it } from "vitest";
import { createShareLinkToken } from "@/lib/supabase/persistence";

describe("share links", () => {
  it("creates a stable token prefix", () => {
    const token = createShareLinkToken();

    expect(token).toMatch(/^share_[a-f0-9]{16}$/);
  });
});
