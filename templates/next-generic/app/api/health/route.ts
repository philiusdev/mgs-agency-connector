import { NextResponse } from "next/server";

import { TYPES_SITE } from "@/lib/agency/contrat-partage";

export const dynamic = "force-dynamic";

const TYPES = new Set<string>(TYPES_SITE);

export function GET() {
  const siteType = process.env.MGS_SITE_TYPE?.trim() ?? "";
  const configured = Boolean(
    process.env.MGS_SITE_ID?.trim() &&
    process.env.MGS_SITE_NAME?.trim() &&
    process.env.MGS_WEBSITE_URL?.trim() &&
    TYPES.has(siteType),
  );

  return NextResponse.json(
    {
      status: configured ? "ok" : "degraded",
      service: "mgs-client-site",
      site_type: TYPES.has(siteType) ? siteType : null,
      version: process.env.MGS_TEMPLATE_VERSION?.trim() || "0.0.0",
      timestamp: new Date().toISOString(),
      checks: {
        configuration: configured ? "ok" : "incomplete",
        business: "not_configured",
      },
    },
    { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
