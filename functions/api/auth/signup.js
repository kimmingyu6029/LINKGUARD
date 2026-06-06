import { authErrorResponse, handleAuthSignup } from "../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthSignup(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
