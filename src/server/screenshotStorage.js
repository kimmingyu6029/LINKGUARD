import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, posix, resolve } from "node:path";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_MAX_SCREENSHOT_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SCREENSHOT_BYTES = 200 * 1024 * 1024;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
const LAST_LOCAL_CLEANUP = { value: 0 };
const LAST_REMOTE_CLEANUP = { value: 0 };

export function createScreenshotStorage({
  env = process.env,
  publicPath = "/screenshots",
  screenshotDir,
} = {}) {
  const driver = String(env.SCREENSHOT_STORAGE_DRIVER || "local").trim().toLowerCase();

  if (driver === "s3" || driver === "r2") {
    return createS3ScreenshotStorage({ env });
  }

  return createLocalScreenshotStorage({ env, publicPath, screenshotDir });
}

export function createLocalScreenshotStorage({
  env = process.env,
  publicPath = "/screenshots",
  screenshotDir,
} = {}) {
  return {
    driver: "local",
    async cleanup() {
      return cleanupLocalScreenshots(screenshotDir, { env });
    },
    async save({ bytes, fileName }) {
      await mkdir(screenshotDir, { recursive: true });
      const filePath = resolve(screenshotDir, fileName);
      await writeFile(filePath, bytes);

      return {
        screenshotKey: fileName,
        screenshotPath: filePath,
        screenshotUrl: `${publicPath.replace(/\/+$/, "")}/${fileName}`,
        storageDriver: "local",
      };
    },
  };
}

export function createS3ScreenshotStorage({ env = process.env, s3Client } = {}) {
  const config = readS3Config(env);
  const client = s3Client || buildS3Client(config);

  return {
    driver: "s3",
    async cleanup() {
      return cleanupS3Screenshots({ client, config, env });
    },
    async save({ bytes, fileName }) {
      const key = buildObjectKey(config.keyPrefix, fileName);

      await client.send(
        new PutObjectCommand({
          Body: bytes,
          Bucket: config.bucket,
          CacheControl: "private, max-age=86400",
          ContentType: "image/png",
          Key: key,
        }),
      );

      const screenshotUrl = config.publicBaseUrl
        ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}`
        : await getSignedUrl(
            client,
            new GetObjectCommand({
              Bucket: config.bucket,
              Key: key,
            }),
            { expiresIn: config.signedUrlTtlSeconds },
          );

      return {
        screenshotKey: key,
        screenshotPath: "",
        screenshotUrl,
        storageDriver: "s3",
      };
    },
  };
}

export async function cleanupLocalScreenshots(
  screenshotDir,
  {
    env = process.env,
    maxAgeMs = readPositiveInt(env.SCREENSHOT_MAX_AGE_MS, DEFAULT_MAX_SCREENSHOT_AGE_MS),
    maxBytes = readPositiveInt(env.SCREENSHOT_MAX_TOTAL_BYTES, DEFAULT_MAX_SCREENSHOT_BYTES),
    now = Date.now(),
  } = {},
) {
  if (now - LAST_LOCAL_CLEANUP.value < 60 * 60 * 1000) {
    return;
  }

  LAST_LOCAL_CLEANUP.value = now;
  await mkdir(screenshotDir, { recursive: true });
  const entries = await readdir(screenshotDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".png") {
      continue;
    }

    const filePath = join(screenshotDir, entry.name);
    const stats = await stat(filePath).catch(() => null);
    if (stats) {
      files.push({ filePath, mtimeMs: stats.mtimeMs, size: stats.size });
    }
  }

  const expiredFiles = files.filter((file) => now - file.mtimeMs > maxAgeMs);
  await Promise.all(expiredFiles.map((file) => rm(file.filePath, { force: true })));

  const remainingFiles = files.filter((file) => now - file.mtimeMs <= maxAgeMs).sort((left, right) => left.mtimeMs - right.mtimeMs);
  let totalBytes = remainingFiles.reduce((sum, file) => sum + file.size, 0);

  for (const file of remainingFiles) {
    if (totalBytes <= maxBytes) {
      break;
    }

    await rm(file.filePath, { force: true });
    totalBytes -= file.size;
  }
}

export async function cleanupS3Screenshots({
  client,
  config,
  env = process.env,
  maxAgeMs = readPositiveInt(env.SCREENSHOT_MAX_AGE_MS, DEFAULT_MAX_SCREENSHOT_AGE_MS),
  maxBytes = readPositiveInt(env.SCREENSHOT_MAX_TOTAL_BYTES, DEFAULT_MAX_SCREENSHOT_BYTES),
  now = Date.now(),
} = {}) {
  if (env.SCREENSHOT_REMOTE_CLEANUP_DISABLED === "true" || now - LAST_REMOTE_CLEANUP.value < 60 * 60 * 1000) {
    return;
  }

  LAST_REMOTE_CLEANUP.value = now;
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
        Prefix: config.keyPrefix ? `${config.keyPrefix.replace(/^\/+|\/+$/g, "")}/` : "",
      }),
    );

    for (const object of response.Contents || []) {
      if (!object.Key || !object.Key.endsWith(".png")) {
        continue;
      }

      objects.push({
        key: object.Key,
        lastModifiedMs: object.LastModified ? object.LastModified.getTime() : now,
        size: Number(object.Size || 0),
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  const expiredKeys = objects.filter((object) => now - object.lastModifiedMs > maxAgeMs).map((object) => object.key);
  await deleteS3Objects(client, config.bucket, expiredKeys);

  const remainingObjects = objects
    .filter((object) => now - object.lastModifiedMs <= maxAgeMs)
    .sort((left, right) => left.lastModifiedMs - right.lastModifiedMs);
  let totalBytes = remainingObjects.reduce((sum, object) => sum + object.size, 0);
  const overflowKeys = [];

  for (const object of remainingObjects) {
    if (totalBytes <= maxBytes) {
      break;
    }

    overflowKeys.push(object.key);
    totalBytes -= object.size;
  }

  await deleteS3Objects(client, config.bucket, overflowKeys);
}

export function readS3Config(env = process.env) {
  const bucket = String(env.SCREENSHOT_BUCKET || env.S3_BUCKET || "").trim();
  const accessKeyId = String(env.SCREENSHOT_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.SCREENSHOT_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || "").trim();

  if (!bucket) {
    throw new Error("SCREENSHOT_BUCKET is required when SCREENSHOT_STORAGE_DRIVER=s3.");
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("SCREENSHOT_ACCESS_KEY_ID and SCREENSHOT_SECRET_ACCESS_KEY are required for screenshot object storage.");
  }

  return {
    accessKeyId,
    bucket,
    endpoint: String(env.SCREENSHOT_ENDPOINT || "").trim() || undefined,
    forcePathStyle: readBoolean(env.SCREENSHOT_FORCE_PATH_STYLE, Boolean(env.SCREENSHOT_ENDPOINT)),
    keyPrefix: normalizeKeyPrefix(env.SCREENSHOT_KEY_PREFIX || "screenshots"),
    publicBaseUrl: String(env.SCREENSHOT_PUBLIC_BASE_URL || "").trim(),
    region: String(env.SCREENSHOT_REGION || env.AWS_REGION || "auto").trim(),
    secretAccessKey,
    signedUrlTtlSeconds: readPositiveInt(env.SCREENSHOT_SIGNED_URL_TTL_SECONDS, DEFAULT_SIGNED_URL_TTL_SECONDS),
  };
}

export function buildObjectKey(prefix, fileName) {
  const safeFileName = basename(fileName || "");
  return prefix ? posix.join(prefix, safeFileName) : safeFileName;
}

function buildS3Client(config) {
  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
  });
}

async function deleteS3Objects(client, bucket, keys) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const batch = uniqueKeys.slice(index, index + 1000);
    if (batch.length === 0) {
      continue;
    }

    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

function normalizeKeyPrefix(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
