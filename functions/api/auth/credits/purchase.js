import { authErrorResponse, handleAuthCreditPurchase } from "../../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthCreditPurchase(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
