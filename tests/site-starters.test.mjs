import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { chargerModeleSite, normaliserNomSite } from "../templates/next-generic/lib/site-starters.ts";

test("les quatre types connus ont un modèle distinct et explicite", () => {
  const types = ["boutique", "vitrine", "custom", "application"];
  const modeles = types.map((type) => chargerModeleSite(type));

  assert.equal(new Set(modeles.map((modele) => modele.libelle)).size, types.length);
  assert.deepEqual(modeles.map((modele) => modele.theme), types);
  assert.ok(modeles.every((modele) => modele.elements.length === 3));
});

test("le modèle boutique ne présente pas le panier ou le paiement comme déjà actifs", () => {
  const modele = chargerModeleSite("boutique");

  assert.match(modele.description, /à configurer avant toute vente/);
  assert.match(modele.note, /Aucun produit ni paiement réel/);
});

test("le modèle mobile décrit le starter Expo et le build Android manuel", () => {
  const modele = chargerModeleSite("application");

  assert.match(modele.accroche, /Android Expo/);
  assert.match(modele.description, /passerelle MGS côté serveur/);
  assert.match(modele.note, /ne publie pas l’application sur Play Store/);
});

test("un type inconnu revient au modèle vitrine et les noms sont bornés", () => {
  assert.equal(chargerModeleSite(undefined).libelle, "Site vitrine");
  assert.equal(chargerModeleSite("unexpected").libelle, "Site vitrine");
  assert.equal(normaliserNomSite("  Client  "), "Client");
  assert.equal(normaliserNomSite("x".repeat(121)), "Votre marque");
});

test("la page de départ affiche les sections partagées sans prétendre fournir des fonctions métier", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../templates/next-generic/app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../templates/next-generic/app/site.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /modele\.libelle/);
  assert.match(page, /data-modele=\{modele\.theme\}/);
  assert.match(page, /modele\.elements\.map/);
  assert.match(page, /id="offre"/);
  assert.match(page, /id="etapes"/);
  assert.match(page, /href="#contenu"/);
  assert.match(page, /Les contenus affichés sont des repères/);
  assert.match(page, /href="\/connexion"/);
  assert.doesNotMatch(page, /form action|fetch\(|\/api\//);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\.site-shell\[data-modele="boutique"\]/);
  assert.match(styles, /\.site-shell\[data-modele="custom"\]/);
  assert.match(styles, /\.site-shell\[data-modele="application"\]/);
});

test("les versions du connecteur et du modèle synchronisé restent alignées", async () => {
  const [connecteur, modele, verrou] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../templates/next-generic/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../templates/next-generic/package-lock.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.equal(connecteur.version, modele.version);
  assert.equal(modele.version, verrou.version);
  assert.equal(modele.version, verrou.packages?.[""]?.version);
});

test("le modèle générique embarque toujours les routes et composants du connecteur", async () => {
  const chemins = [
    "../templates/next-generic/app/api/health/route.ts",
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

test("la sonde universelle est incluse dans le modèle généré", async () => {
  const [script, sonde] = await Promise.all([
    readFile(new URL("../scripts/sync-next-template.mjs", import.meta.url), "utf8"),
    readFile(new URL("../templates/next-generic/app/api/health/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(script, /\["app\/api\/health", "app\/api\/health"\]/);
  assert.match(sonde, /service: "mgs-client-site"/);
  assert.match(sonde, /business: "not_configured"/);
  assert.doesNotMatch(sonde, /MGS_SITE_(?:KEY|SECRET)/);
});

test("le mobile authentifie les administrateurs et ne livre jamais de clé MGS dans le bundle", async () => {
  const [gateway, app, login, config, workflow] = await Promise.all([
    readFile(new URL("../templates/next-generic/app/api/mobile/agency/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../templates/expo-generic/mobile/src/lib/supabase.ts", import.meta.url), "utf8"),
    readFile(new URL("../templates/expo-generic/mobile/src/app/login.tsx", import.meta.url), "utf8"),
    readFile(new URL("../templates/next-generic/app/api/mobile/config/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/build-client-android.yml", import.meta.url), "utf8"),
  ]);

  const authCheck = gateway.indexOf("auth.getUser(token)");
  const adminCheck = gateway.indexOf("administrateursAutorises().has(email)");
  const platformCall = gateway.indexOf("await callAgency");
  assert.ok(authCheck < adminCheck && adminCheck < platformCall);
  assert.match(app, /expo-secure-store/);
  assert.doesNotMatch(app, /MGS_SITE_(?:KEY|SECRET)/);
  assert.match(login, /auth-email-start/);
  assert.match(login, /verifyOtp/);
  assert.match(config, /supabase_anon_key/);
  assert.doesNotMatch(config, /MGS_SITE_(?:KEY|SECRET)/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /app-debug\.apk/);
});
