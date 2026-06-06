import assert from "node:assert/strict";
import test from "node:test";
import { buildObjectKey, createS3ScreenshotStorage, readS3Config } from "../src/server/screenshotStorage.js";

test("builds safe object keys under the configured prefix", () => {
  assert.equal(buildObjectKey("screenshots", "screenshot-123.png"), "screenshots/screenshot-123.png");
  assert.equal(buildObjectKey("tenant-a/screens", "../screenshot-123.png"), "tenant-a/screens/screenshot-123.png");
  assert.equal(buildObjectKey("", "screenshot-123.png"), "screenshot-123.png");
});

test("reads R2/S3 screenshot storage configuration from environment", () => {
  const config = readS3Config({
    SCREENSHOT_ACCESS_KEY_ID: "access-key",
    SCREENSHOT_BUCKET: "linkguard-shots",
    SCREENSHOT_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
    SCREENSHOT_KEY_PREFIX: "/screenshots/prod/",
    SCREENSHOT_PUBLIC_BASE_URL: "https://shots.example.com",
    SCREENSHOT_REGION: "auto",
    SCREENSHOT_SECRET_ACCESS_KEY: "secret-key",
  });

  assert.equal(config.bucket, "linkguard-shots");
  assert.equal(config.endpoint, "https://account-id.r2.cloudflarestorage.com");
  assert.equal(config.forcePathStyle, true);
  assert.equal(config.keyPrefix, "screenshots/prod");
  assert.equal(config.publicBaseUrl, "https://shots.example.com");
  assert.equal(config.region, "auto");
});

test("uploads screenshot bytes and returns a public object URL", async () => {
  const sentCommands = [];
  const fakeClient = {
    async send(command) {
      sentCommands.push(command);
      return {};
    },
  };
  const storage = createS3ScreenshotStorage({
    env: {
      SCREENSHOT_ACCESS_KEY_ID: "access-key",
      SCREENSHOT_BUCKET: "linkguard-shots",
      SCREENSHOT_KEY_PREFIX: "screenshots",
      SCREENSHOT_PUBLIC_BASE_URL: "https://shots.example.com",
      SCREENSHOT_SECRET_ACCESS_KEY: "secret-key",
    },
    s3Client: fakeClient,
  });

  const result = await storage.save({
    bytes: Buffer.from("png"),
    fileName: "screenshot-abc.png",
  });

  assert.equal(sentCommands.length, 1);
  assert.equal(sentCommands[0].input.Bucket, "linkguard-shots");
  assert.equal(sentCommands[0].input.ContentType, "image/png");
  assert.equal(sentCommands[0].input.Key, "screenshots/screenshot-abc.png");
  assert.equal(result.screenshotKey, "screenshots/screenshot-abc.png");
  assert.equal(result.screenshotUrl, "https://shots.example.com/screenshots/screenshot-abc.png");
  assert.equal(result.storageDriver, "s3");
});
