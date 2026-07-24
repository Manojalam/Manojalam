import assert from "node:assert/strict";
import test from "node:test";

import { getUserIdentity } from "./user-identity";

test("uses the saved display name and shows initials", () => {
  assert.deepEqual(
    getUserIdentity({
      email: "nalin@example.com",
      user_metadata: { display_name: "Nalin Kumar" },
    }),
    {
      displayName: "Nalin Kumar",
      email: "nalin@example.com",
      initials: "NK",
    }
  );
});

test("supports common OAuth profile name metadata", () => {
  assert.equal(
    getUserIdentity({
      email: "reader@example.com",
      user_metadata: { full_name: "Ananya Rao" },
    }).displayName,
    "Ananya Rao"
  );

  assert.equal(
    getUserIdentity({
      email: "reader@example.com",
      user_metadata: { name: "Ananya Rao" },
    }).displayName,
    "Ananya Rao"
  );
});

test("falls back to the email name when profile metadata is empty", () => {
  assert.deepEqual(
    getUserIdentity({
      email: "reader@example.com",
      user_metadata: { display_name: "  " },
    }),
    {
      displayName: "reader",
      email: "reader@example.com",
      initials: "R",
    }
  );
});
