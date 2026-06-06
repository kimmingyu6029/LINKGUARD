import { authErrorResponse, handleAuthPlan } from "../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthPlan(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
