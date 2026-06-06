import { authErrorResponse, handleAuthWalletDeposit } from "../../../../src/cloudflare/authApi.js";

export async function onRequest({ env, request }) {
  try {
    return await handleAuthWalletDeposit(request, env);
  } catch (error) {
    return authErrorResponse(error);
  }
}
