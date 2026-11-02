import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { callAgency } from "@/lib/agency/client";

export const dynamic = "force-dynamic";

function administrateursAutorises(): Set<string> {
  return new Set(
    (process.env.MGS_SITE_ADMIN_EMAILS ?? "")
      .split(/[,\n;]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 8192) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !process.env.MGS_SITE_KEY || !process.env.MGS_SITE_SECRET) {
    console.error("[mgs-mobile] La passerelle du site n’est pas configurée.");
    return NextResponse.json({ error: "Le connecteur du site est momentanément indisponible." }, { status: 503 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "Session invalide ou expirée." }, { status: 401 });
  }

  const email = data.user.email.trim().toLowerCase();
  if (!administrateursAutorises().has(email)) {
    return NextResponse.json({ error: "Cet utilisateur n’est pas autorisé à gérer le site." }, { status: 403 });
  }

  const agency = await callAgency<unknown>("/api/v1/agency");
  if (agency === null) {
    return NextResponse.json(
      { error: "Le connecteur MGS ne répond pas pour le moment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(agency, { headers: { "Cache-Control": "no-store, private" } });
}
