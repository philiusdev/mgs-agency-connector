import { test } from "node:test";
import assert from "node:assert/strict";

import { construireDiagnostic, libelleSante } from "../lib/agency/health.ts";

test("diagnostic sans métriques reste sain si configuré", () => {
  // Sans variables d'environnement, le connecteur n'est pas configuré.
  delete process.env.MGS_PLATFORM_URL;
  delete process.env.MGS_SITE_KEY;
  delete process.env.MGS_SITE_SECRET;
  const d = construireDiagnostic();
  assert.equal(d.configure, false);
  assert.equal(d.sante, "panne");
  assert.equal(libelleSante(d.sante), "Connexion plateforme indisponible : vérifiez les clés et l'URL.");
});

test("libelleSante couvre les trois états", () => {
  assert.match(libelleSante("ok"), /opérationnelle/);
  assert.match(libelleSante("degrade"), /dégradée/);
  assert.match(libelleSante("panne"), /indisponible/);
});
