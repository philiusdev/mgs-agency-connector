// Diagnostic de la connexion site ↔ plateforme.
// Ce module n'est PAS côté route : il est destiné à être appelé depuis
// une page d'administration ou un composant serveur pour afficher l'état
// de santé du connecteur, sans faire d'appel réseau à la plateforme.
import { getMetriquesConnexion, connecteurAgenceConfigure } from "./client";

/** Résultat du diagnostic de santé du connecteur. */
export type DiagnosticConnexion = {
  configure: boolean;
  sante: "ok" | "degrade" | "panne";
  chemins: Array<{
    chemin: string;
    statut: "ok" | "degrade" | "panne";
    totalAppels: number;
    tauxReussite: number;
    enCircuitOuvert: boolean;
    dernierEchec: number | null;
  }>;
  resume: {
    totalChemins: number;
    cheminsEnPanne: number;
    tauxReussiteGlobal: number;
  };
};

/** Construit un diagnostic complet à partir des métriques locales. */
export function construireDiagnostic(): DiagnosticConnexion {
  const metriques = getMetriquesConnexion();
  const maintenant = Date.now();
  const configure = connecteurAgenceConfigure();

  const chemins = metriques.map((m) => {
    let statut: "ok" | "degrade" | "panne" = "ok";
    if (m.enCircuitOuvert) statut = "panne";
    else if (m.totalAppels > 0 && (m.totalSucces / m.totalAppels) * 100 < 70) statut = "degrade";
    else if (m.dernierEchec && maintenant - m.dernierEchec < 60_000) statut = "degrade";

    return {
      chemin: m.chemin,
      statut,
      totalAppels: m.totalAppels,
      tauxReussite: m.totalAppels === 0 ? 100 : Math.round((m.totalSucces / m.totalAppels) * 100),
      enCircuitOuvert: m.enCircuitOuvert,
      dernierEchec: m.dernierEchec,
    };
  });

  const cheminsEnPanne = chemins.filter((c) => c.statut === "panne").length;
  const totalAppels = chemins.reduce((s, c) => s + c.totalAppels, 0);
  const totalEchecs = chemins.reduce((s, c) => {
    const m = metriques.find((mm) => mm.chemin === c.chemin)!;
    return s + m.totalEchecs;
  }, 0);
  const tauxReussiteGlobal = totalAppels === 0 ? 100 : Math.round(((totalAppels - totalEchecs) / totalAppels) * 100);

  let sante: "ok" | "degrade" | "panne" = "ok";
  if (!configure) sante = "panne";
  else if (cheminsEnPanne > 0) sante = "panne";
  else if (chemins.some((c) => c.statut === "degrade")) sante = "degrade";

  return {
    configure,
    sante,
    chemins,
    resume: {
      totalChemins: chemins.length,
      cheminsEnPanne,
      tauxReussiteGlobal,
    },
  };
}

/** Message lisible pour un statut de santé. */
export function libelleSante(sante: DiagnosticConnexion["sante"]): string {
  switch (sante) {
    case "ok": return "Connexion plateforme opérationnelle.";
    case "degrade": return "Connexion plateforme dégradée : certains chemins échouent.";
    case "panne": return "Connexion plateforme indisponible : vérifiez les clés et l'URL.";
  }
}