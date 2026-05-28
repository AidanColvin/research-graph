import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://aria-pi-backend.onrender.com';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Render free tier cold-starts can take ~50 s; give the backend up to 5 min.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 295_000);

  try {
    const upstream = await fetch(`${BACKEND_URL}/run-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
