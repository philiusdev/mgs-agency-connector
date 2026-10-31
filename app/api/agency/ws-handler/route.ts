// Handler WebSocket côté site client.
// Traite les événements reçus de la plateforme via le client WebSocket.

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  lireSessionAdmin,
  repErreur,
  repRefus,
  verifierOriginePost,
} from "../_interne/securite";

export const dynamic = "force-dynamic";

const schemaEvenement = z.object({
  type: z.string().trim().min(1).max(80),
  donnees: z.unknown().optional(),
});

/**
 * GET /api/agency/ws-handler
 *
 * L'URL du serveur WebSocket reste réservée à l'administration du site.
 */
export async function GET() {
  const session = await lireSessionAdmin();
  if (!session.ok) return repRefus(session);

  return NextResponse.json({
    websocket: {
      enabled: true,
      endpoint: process.env.MGS_WS_URL || null,
      autoReconnect: true,
      heartbeatInterval: 25000,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/agency/ws-handler
 *
 * L'origine et la session sont vérifiées avant d'accepter un événement :
 * cette route ne doit jamais devenir un point d'entrée anonyme.
 */
export async function POST(request: Request) {
  const origine = verifierOriginePost(request);
  if (!origine.ok) return repErreur(origine.erreur, 403);

  const session = await lireSessionAdmin();
  if (!session.ok) return repRefus(session);

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return repErreur("Événement invalide.", 400);
  }

  const evenement = schemaEvenement.safeParse(corps);
  if (!evenement.success) return repErreur("Événement invalide.", 400);

  console.info("[mgs-agency] Événement WebSocket reçu.", { type: evenement.data.type });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
