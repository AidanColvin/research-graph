import { NextRequest, NextResponse } from 'next/server';

// Live FastAPI backend (Vercel project "aria-pi-api"), clean public alias —
// NOT behind Deployment Protection, so the proxy reaches it without a token.
//
// IMPORTANT: we deliberately do NOT read NEXT_PUBLIC_API_URL here. A stale
// NEXT_PUBLIC_API_URL in .env.production used to point this proxy at an old
// backend (every sector returned pharma). Only an explicit BACKEND_API_URL
// server var may override; otherwise we always use the live alias.
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://aria-pi-api.vercel.app';

// If the backend project keeps Vercel Deployment Protection ON, set this env
// to the project's protection-bypass token so the server-side proxy can reach
// it. If protection is OFF (recommended for this public-data API), leave unset.
const BYPASS_TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Backend runs all sources within a 40 s budget; allow generous headroom.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 295_000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (BYPASS_TOKEN) headers['x-vercel-protection-bypass'] = BYPASS_TOKEN;

  try {
    const upstream = await fetch(`${BACKEND_URL}/run-pipeline`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await upstream.json();
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err?.name === 'AbortError';
    return NextResponse.json(
      { error: isTimeout ? 'Backend timed out' : (err?.message ?? 'Upstream error') },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
