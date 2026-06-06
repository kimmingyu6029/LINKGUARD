import { authErrorResponse, handleAuthWallet } from "../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthWallet(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
