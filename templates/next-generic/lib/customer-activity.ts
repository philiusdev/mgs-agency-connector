import { lireSessionAdmin } from "@/app/api/agency/_interne/securite";
import { callAgenceAvecDetail } from "@/lib/agency/client";

/**
 * Signale une connexion d'administration après vérification de la session.
 *
 * Le site générique ne porte pas de commandes : il ne peut donc pas inventer
 * des événements de vente. Les futurs parcours métier appelleront le même
 * relais après avoir enregistré et vérifié leur propre opération.
 */
export async function enregistrerActiviteConnexion(action: "connexion" | "deconnexion") {
  const resultat = await lireSessionAdmin();
  if (!resultat.ok) return { ok: false as const, error: resultat.erreur };

  const reponse = await callAgenceAvecDetail("/api/v1/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [{
        source_event_id: crypto.randomUUID(),
        actor_id: resultat.session.utilisateurId,
        actor_label: (resultat.session.nom ?? resultat.session.email ?? "Administration").slice(0, 120),
        actor_kind: "equipe",
        action,
        resource: "auth.users",
        resource_id: resultat.session.utilisateurId,
        occurred_at: new Date().toISOString(),
        details: {},
      }],
    }),
  });

  if (!reponse?.ok) {
    return {
      ok: false as const,
      error: reponse?.disponible
        ? "La plateforme a refusé le relais."
        : "La plateforme est momentanément inaccessible.",
    };
  }
  return { ok: true as const };
}
