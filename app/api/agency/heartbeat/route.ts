import { NextResponse } from "next/server";
import { callAgency } from "@/lib/client";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await callAgency("/api/v1/heartbeat", { method: "POST", body: JSON.stringify({
    template_version: process.env.MGS_TEMPLATE_VERSION ?? "0.0.0",
    meta: typeof body === "object" && body ? body : {},
  }) });
  return NextResponse.json({ ok: Boolean(result) }, { status: result ? 200 : 503 });
}
