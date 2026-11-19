export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ gemini: Boolean(process.env.GEMINI_API_KEY) }), {
    headers: { 'content-type': 'application/json' },
  });
}
