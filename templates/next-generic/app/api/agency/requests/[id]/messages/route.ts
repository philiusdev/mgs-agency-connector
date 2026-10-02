import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { callAgenceAvecDetail, callAgency } from "@/lib/agency/client";
import {
  lireSessionAdmin,
  repErreur,
  repRefus,
  verifierOriginePost,
} from "../../../_interne/securite";

const UUID = z.string().uuid("Identifiant de demande invalide.");
const schemaMessage = z.object({
  contenu: z.string().trim().min(1, "Le message ne peut pas être vide.").max(2000, "Le message est trop long."),
});
const CHEMIN_MESSAGES = "/api/v1/agency/requests";

type MessageAgence = {
  id: string;
  auteur: "client" | "agent" | "system";
  contenu: string;
  lu: boolean;
  created_at: string;
};

type EnveloppeMessages = { messages?: unknown };

function messagesDe(brut: unknown): MessageAgence[] | null {
  if (!brut || typeof brut !== "object") return null;
  const valeur = (brut as EnveloppeMessages).messages;
  if (!Array.isArray(valeur)) return null;
  const messages: MessageAgence[] = [];
  for (const ligne of valeur) {
    if (
      ligne &&
      typeof ligne === "object" &&
      typeof ligne.id === "string" &&
      (ligne.auteur === "client" || ligne.auteur === "agent" || ligne.auteur === "system") &&
      typeof ligne.contenu === "string" &&
      typeof ligne.lu === "boolean" &&
      typeof ligne.created_at === "string" &&
      Number.isFinite(Date.parse(ligne.created_at))
    ) {
      messages.push(ligne as MessageAgence);
    } else {
      return null;
    }
  }
  return messages;
}

async function autoriser(request: Request, rawId: string, mutation = false) {
  if (mutation) {
    const origine = verifierOriginePost(request);
    if (!origine.ok) return { reponse: repErreur(origine.erreur, 403) } as const;
  }

  const session = await lireSessionAdmin();
  if (!session.ok) return { reponse: repRefus(session) } as const;

  const parsed = UUID.safeParse(rawId);
  if (!parsed.success) return { reponse: repErreur("Identifiant de demande invalide.", 400) } as const;
  return { id: parsed.data } as const;
}

export async function GET(
  request: NextRequest,
  contexte: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await contexte.params;
  const acces = await autoriser(request, rawId);
  if ("reponse" in acces) return acces.reponse;

  const resultat = await callAgency<EnveloppeMessages>(`${CHEMIN_MESSAGES}/${acces.id}/messages`);
  const messages = messagesDe(resultat);
  if (messages === null) {
    return repErreur("Les messages sont momentanément indisponibles.", 503);
  }
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: NextRequest,
  contexte: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await contexte.params;
  const acces = await autoriser(request, rawId, true);
  if ("reponse" in acces) return acces.reponse;

  const parsed = schemaMessage.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return repErreur(parsed.error.issues[0]?.message ?? "Message invalide.", 422);
  }

  const resultat = await callAgenceAvecDetail<{ message?: unknown; suivi_indisponible?: unknown }>(
    `${CHEMIN_MESSAGES}/${acces.id}/messages`,
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
  if (resultat === null) {
    return repErreur("Le message n’a pas pu être transmis. Réessayez dans un instant.", 503);
  }
  if (!resultat.ok) {
    const corps = resultat.corps as { error?: unknown } | null;
    const erreur = typeof corps?.error === "string" && corps.error.trim()
      ? corps.error
      : "Le message n’a pas pu être envoyé.";
    return repErreur(erreur, resultat.statut);
  }

  const messages = messagesDe({ messages: [resultat.valeur.message] });
  if (!messages || messages.length !== 1) {
    return repErreur("La plateforme a accepté le message, mais sa confirmation est illisible. Actualisez la conversation avant de réessayer.", 502);
  }

  return NextResponse.json({
    message: messages[0],
    suivi_indisponible: resultat.valeur.suivi_indisponible === true,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
