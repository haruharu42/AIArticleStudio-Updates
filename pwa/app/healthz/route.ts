export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      app: "ai-article-studio-pwa",
      phase: 17,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
