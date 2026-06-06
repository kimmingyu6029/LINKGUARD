import { authErrorResponse, handleAuthSession } from "../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthSession(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
