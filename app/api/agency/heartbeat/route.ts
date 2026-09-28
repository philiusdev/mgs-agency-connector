import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callAgency } from "@/lib/agency/client";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé à l’administration." }, { status: 403 });
  }

  const result = await callAgency("/api/v1/heartbeat", {
    method: "POST",
    body: JSON.stringify({ template_version: process.env.MGS_TEMPLATE_VERSION ?? "1.0.0" }),
  });
  return NextResponse.json({ ok: Boolean(result) }, { status: result ? 200 : 503 });
}
