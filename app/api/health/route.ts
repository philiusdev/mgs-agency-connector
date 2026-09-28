import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    version: process.env.MGS_TEMPLATE_VERSION ?? "0.0.0",
    timestamp: new Date().toISOString(),
  });
}
