import { handleAnalyzeUrl } from "../../src/cloudflare/linkguardApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAnalyzeUrl(request, env);
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
      status: error.statusCode || 500,
    });
  }
}
