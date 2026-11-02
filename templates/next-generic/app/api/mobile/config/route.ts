import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const platformUrl = process.env.MGS_PLATFORM_URL;
  const siteId = process.env.MGS_SITE_ID;
  if (!supabaseUrl || !supabaseAnonKey || !platformUrl || !siteId) {
    return NextResponse.json(
      { error: "La configuration publique de connexion est absente." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      supabase_url: supabaseUrl,
      supabase_anon_key: supabaseAnonKey,
      platform_url: platformUrl,
      site_id: siteId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
