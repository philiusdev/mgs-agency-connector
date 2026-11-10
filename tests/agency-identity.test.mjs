import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const space = await readFile(new URL("../lib/agency/space.ts", import.meta.url), "utf8");

test("une URL absente de la plateforme ne retombe pas sur l'ancien domaine local", () => {
  assert.match(
    space,
    /const identite = normaliserIdentite\(identiteBrut, plateforme === null\);\s*if \(identiteBrut !== null\) return identite;\s*return \{ \.\.\.identite, site_web: null \};/,
  );
});
