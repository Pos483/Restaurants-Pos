import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== "string") {
      return NextResponse.json(
        { ok: false, error: "Email is required." },
        { status: 400 },
      );
    }

    const email = body.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : null;
    const source =
      typeof body.source === "string" && body.source.trim()
        ? body.source.trim().slice(0, 60)
        : "download-cta";
    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim().slice(0, 2000)
        : null;

    await db.lead.create({
      data: { email, name, source, message },
    });

    return NextResponse.json({
      ok: true,
      message: "Thanks! Your download link is on its way.",
    });
  } catch (err) {
    console.error("[api/leads] error", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const count = await db.lead.count();
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    console.error("[api/leads] count error", err);
    return NextResponse.json({ ok: true, count: 0 });
  }
}
