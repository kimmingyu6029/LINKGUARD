import { authErrorResponse, handleAuthLogout } from "../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthLogout(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
