import { NextResponse } from "next/server";
import { z } from "zod";
import { callAgency } from "@/lib/agency/client";

/**
 * Transmet la demande d'amélioration du commerçant vers la plateforme, qui la
 * dépose dans ses tickets. C'est le seul endroit où le navigateur écrit vers
 * l'agence : la clé du site reste côté serveur.
 *
 * L'email du commerçant est fourni par le dashboard, qui connaît la session
 * administrateur en cours. Sans lui, la demande part quand même mais l'agence
 * ne peut pas répondre : la plateforme exige une adresse valide.
 */
const schema = z.object({
  message: z.string().trim().min(10).max(2000),
  requesterEmail: z.string().trim().email().max(160).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Écrivez quelques mots pour expliquer votre demande." }, { status: 400 });
  }

  const { message, requesterEmail } = parsed.data;
  const result = await callAgency<{ id?: string }>("/api/v1/tickets", {
    method: "POST",
    body: JSON.stringify({
      requester_name: "Commerçant",
      requester_email: requesterEmail || "contact@boutique.invalid",
      category: "amelioration",
      subject: message.slice(0, 180),
      message,
    }),
  });

  if (!result) {
    return NextResponse.json({ error: "Votre demande n’a pas pu être envoyée. Réessayez dans un instant." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
