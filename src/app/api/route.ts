import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Siya Bill API",
    version: "1.0.0",
    status: "ok",
    endpoints: ["/api/leads"],
  });
}
