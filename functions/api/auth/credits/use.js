import { authErrorResponse, handleAuthCreditUse } from "../../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthCreditUse(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
