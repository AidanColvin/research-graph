/**
 * Takes: Sector name string.
 * Does: Sends a POST request to the FastAPI orchestrator.
 * Returns: The JSON response containing the generated report data.
 */
export async function runPipeline(sector: string) {
  // Uses the public URL on Vercel, but safely falls back to localhost for testing
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  const response = await fetch(`${baseUrl}/run-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sector, company_override: "Johnson & Johnson" })
  });
  
  if (!response.ok) {
    throw new Error('Pipeline execution failed');
  }
  
  return response.json();
}
