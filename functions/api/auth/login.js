import { authErrorResponse, handleAuthLogin } from "../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthLogin(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
