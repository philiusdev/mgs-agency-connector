import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { chargerModeleSite, normaliserNomSite } from "../templates/next-generic/lib/site-starters.ts";

test("les quatre types connus ont un modèle distinct et explicite", () => {
  const types = ["boutique", "vitrine", "custom", "application"];
  const modeles = types.map((type) => chargerModeleSite(type));

  assert.equal(new Set(modeles.map((modele) => modele.libelle)).size, types.length);
  assert.ok(modeles.every((modele) => modele.elements.length === 3));
});

test("le modèle boutique ne présente pas le panier ou le paiement comme déjà actifs", () => {
  const modele = chargerModeleSite("boutique");

  assert.match(modele.description, /à configurer avant toute vente/);
  assert.match(modele.note, /Aucun produit ni paiement réel/);
});

test("le modèle mobile annonce clairement que l’automatisation n’existe pas", () => {
  const modele = chargerModeleSite("application");

  assert.match(modele.accroche, /automatisation non disponible/);
  assert.match(modele.description, /ne crée pas de projet mobile natif/);
  assert.match(modele.note, /Aucun dépôt mobile ni build/);
});

test("un type inconnu revient au modèle vitrine et les noms sont bornés", () => {
  assert.equal(chargerModeleSite(undefined).libelle, "Site vitrine");
  assert.equal(chargerModeleSite("unexpected").libelle, "Site vitrine");
  assert.equal(normaliserNomSite("  Client  "), "Client");
  assert.equal(normaliserNomSite("x".repeat(121)), "Votre marque");
});

test("le modèle générique embarque toujours les routes et composants du connecteur", async () => {
  const chemins = [
    "../templates/next-generic/app/api/agency/heartbeat/route.ts",
    "../templates/next-generic/app/api/agency/request/route.ts",
    "../templates/next-generic/app/admin/page.tsx",
    "../templates/next-generic/components/agency/AgencyPanel.tsx",
    "../templates/next-generic/lib/agency/client.ts",
    "../templates/next-generic/lib/webhooks/signing.ts",
  ];

  for (const chemin of chemins) {
    const contenu = await readFile(new URL(chemin, import.meta.url), "utf8");
    assert.ok(contenu.length > 0, `${chemin} doit être présent dans le modèle`);
  }
});
