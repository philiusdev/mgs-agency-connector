import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tokenType = request.nextUrl.searchParams.get("type");
  const next = request.nextUrl.searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }
  if (tokenHash && tokenType === "magiclink" && /^[A-Za-z0-9_-]{32,256}$/.test(tokenHash)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }
  return NextResponse.redirect(new URL("/connexion?error=auth_callback", request.url));
}
