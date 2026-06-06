import { handleSecurityCases } from "../../src/cloudflare/linkguardApi.js";

export async function onRequest({ env }) {
  return handleSecurityCases(env);
}
