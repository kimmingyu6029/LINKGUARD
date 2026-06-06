import { handleSecurityComic } from "../../src/cloudflare/securityComicApi.js";

export async function onRequest({ env, request }) {
  return handleSecurityComic(request, env);
}
