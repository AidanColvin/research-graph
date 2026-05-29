import { NextRequest } from 'next/server';

// Streaming proxy: forwards the backend's Server-Sent Events progress stream
// straight through to the browser so the progress UI reflects real backend
// work. Never cached — every search is a fresh, live stream.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const BACKEND_URL = process.env.BACKEND_API_URL || 'https://aria-pi-api.vercel.app';
const BYPASS_TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 295_000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (BYPASS_TOKEN) headers['x-vercel-protection-bypass'] = BYPASS_TOKEN;

  try {
    const upstream = await fetch(`${BACKEND_URL}/run-pipeline-stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!upstream.ok || !upstream.body) {
      return new Response(
        JSON.stringify({ error: `Upstream stream failed (${upstream.status})` }),
        { status: upstream.status || 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Pipe the upstream SSE stream straight to the client.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err?.name === 'AbortError';
    return new Response(
      JSON.stringify({ error: isTimeout ? 'Backend timed out' : (err?.message ?? 'Upstream error') }),
      { status: isTimeout ? 504 : 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
