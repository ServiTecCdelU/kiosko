// app/api/sync/route.ts
import { NextResponse } from "next/server";
import { syncProductosFromDistribuidora } from "@/services/sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await syncProductosFromDistribuidora();
  const status = result.estado === "error" ? 500 : 200;
  return NextResponse.json(result, { status });
}
