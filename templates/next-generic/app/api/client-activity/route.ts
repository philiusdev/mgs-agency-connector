import { NextResponse } from "next/server";
import { z } from "zod";

import { enregistrerActiviteConnexion } from "@/lib/customer-activity";

const schema = z.object({
  type: z.literal("connexion"),
}).strict();

export async function POST(request: Request) {
  const origine = request.headers.get("origin");
  if (!origine || new URL(origine).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Activité invalide." }, { status: 400 });
  }

  const resultat = await enregistrerActiviteConnexion("connexion");
  if (!resultat.ok) {
    console.error("[mgs-activity] Connexion non relayée.", resultat.error);
    return NextResponse.json({ error: "Connexion enregistrée, activité non transmise." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
