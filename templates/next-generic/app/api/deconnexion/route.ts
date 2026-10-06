import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { enregistrerActiviteConnexion } from "@/lib/customer-activity";

export async function POST(request: NextRequest) {
  const activite = await enregistrerActiviteConnexion("deconnexion");
  if (!activite.ok) {
    console.error("[mgs-activity] Déconnexion non relayée.", activite.error);
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
