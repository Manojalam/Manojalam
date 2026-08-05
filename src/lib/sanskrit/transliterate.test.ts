import assert from "node:assert/strict";
import test from "node:test";

import {
  devanagariToIast,
  shouldRefreshAutomaticIast,
} from "./transliterate";

const VERSE = "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।\nमामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥";
const IAST = "dharmakṣetre kurukṣetre samavetā yuyutsavaḥ |\nmāmakāḥ pāṇḍavāścaiva kimakurvata sañjaya ||";

test("Devanāgarī verses transliterate automatically to complete IAST", () => {
  assert.equal(devanagariToIast(VERSE), IAST);
});

test("automatic IAST repair accepts blanks and truncated prefixes only", () => {
  assert.equal(shouldRefreshAutomaticIast(VERSE, ""), true);
  assert.equal(shouldRefreshAutomaticIast(VERSE, "dharmakṣetre kurukṣetre"), true);
  assert.equal(shouldRefreshAutomaticIast(VERSE, IAST), true);
  assert.equal(shouldRefreshAutomaticIast(VERSE, "intentional manual reading"), false);
});
