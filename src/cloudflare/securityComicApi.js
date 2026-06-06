import {
  defaultImageModel,
  defaultGeminiImageModel,
  generateSecurityComicImages,
} from "../lib/securityComicImageApi.js";

export async function handleSecurityComic(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson({ error: "Method not allowed" }, 405);
  }

  const payload = await request.json().catch(() => null);

  if (!payload) {
    return sendJson({ error: "Invalid JSON" }, 400);
  }

  try {
    const result = await generateSecurityComicImages(payload, {
      apiKey: env.OPENAI_API_KEY,
      geminiApiKey: env.GEMINI_API_KEY,
      geminiImageModel: env.GEMINI_IMAGE_MODEL || defaultGeminiImageModel,
      imageModel: env.OPENAI_IMAGE_MODEL || defaultImageModel,
      provider: env.IMAGE_PROVIDER,
    });
    return sendJson(result, 200);
  } catch (error) {
    return sendJson({ error: error.message || "Internal server error" }, error.statusCode || 500);
  }
}

function sendJson(payload, status) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });
}
