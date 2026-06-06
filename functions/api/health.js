import { handleHealth } from "../../src/cloudflare/linkguardApi.js";

export async function onRequest({ env }) {
  return handleHealth(env);
}
