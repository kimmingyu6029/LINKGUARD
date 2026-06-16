import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_DATA = {
  report_events: [],
  reported_urls: [],
};

export function createLocalCommunityDb(filePath, authDb = null) {
  const absolutePath = resolve(filePath);
  let dataPromise = null;

  async function loadData() {
    if (!dataPromise) {
      dataPromise = readFile(absolutePath, "utf8")
        .then((text) => normalizeData(JSON.parse(text)))
        .catch((error) => {
          if (error.code === "ENOENT") {
            return structuredClone(DEFAULT_DATA);
          }

          throw error;
        });
    }

    return dataPromise;
  }

  async function saveData(data) {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  return {
    prepare(sql) {
      return {
        all: () => executeAll({ args: [], authDb, loadData, sql }),
        bind(...args) {
          return {
            all: () => executeAll({ args, authDb, loadData, sql }),
            first: () => executeFirst({ args, authDb, loadData, sql }),
            run: () => executeRun({ args, loadData, saveData, sql }),
          };
        },
        first: () => executeFirst({ args: [], authDb, loadData, sql }),
        run: () => executeRun({ args: [], loadData, saveData, sql }),
      };
    },
  };
}

async function executeFirst({ args, authDb, loadData, sql }) {
  const data = await loadData();
  const normalizedSql = normalizeSql(sql);

  if (normalizedSql.includes("from reported_urls") && normalizedSql.includes("where url_hash = ?")) {
    return data.reported_urls.find((row) => row.url_hash === args[0]) || null;
  }

  if (normalizedSql.includes("from reported_urls") && normalizedSql.includes("where id = ?")) {
    return data.reported_urls.find((row) => row.id === args[0]) || null;
  }

  if (normalizedSql.includes("from report_events") && normalizedSql.includes("reporter_ip_hash = ?")) {
    const [reportedUrlId, reporterIpHash, since] = args;
    return (
      data.report_events.find(
        (row) =>
          row.reported_url_id === reportedUrlId && row.reporter_ip_hash === reporterIpHash && row.created_at >= since,
      ) || null
    );
  }

  if (normalizedSql.includes("count(*) as count") && normalizedSql.includes("from report_events")) {
    const [reporterIpHash, since] = args;
    return {
      count: data.report_events.filter((row) => row.reporter_ip_hash === reporterIpHash && row.created_at >= since)
        .length,
    };
  }

  if (normalizedSql.includes("count(*) as report_count") && normalizedSql.includes("from report_events")) {
    const [reportedUrlId] = args;
    const events = data.report_events.filter((row) => row.reported_url_id === reportedUrlId);

    return {
      report_count: events.length,
      unique_reporters: new Set(events.map((row) => row.reporter_ip_hash)).size,
      updated_at: events.map((row) => row.created_at).sort().at(-1) || "",
    };
  }

  if (normalizedSql.includes("select report_type, count(*) as type_count")) {
    const [reportedUrlId] = args;
    const counts = new Map();

    for (const event of data.report_events.filter((row) => row.reported_url_id === reportedUrlId)) {
      counts.set(event.report_type, (counts.get(event.report_type) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([report_type, type_count]) => ({ report_type, type_count }))
      .sort((left, right) => right.type_count - left.type_count)[0] || null;
  }

  if (normalizedSql.includes("inner join users") && normalizedSql.includes("sessions.token_hash = ?") && authDb) {
    return authDb.prepare(sql).bind(...args).first();
  }

  if (normalizedSql.includes("select user_id from sessions") && authDb) {
    return authDb.prepare(sql).bind(...args).first();
  }

  return null;
}

async function executeAll({ args, authDb, loadData, sql }) {
  const data = await loadData();
  const normalizedSql = normalizeSql(sql);

  if (normalizedSql.includes("from reported_urls") && normalizedSql.includes("where url_hash in")) {
    const argCount = args.length / 3;
    const hashes = new Set(args.slice(0, argCount));
    const normalizedUrls = new Set(args.slice(argCount));
    const rows = data.reported_urls
      .filter((row) => hashes.has(row.url_hash) || normalizedUrls.has(row.normalized_url) || normalizedUrls.has(row.final_url))
      .sort(compareReportedUrls)
      .slice(0, 8);

    return { results: rows };
  }

  if (normalizedSql.includes("from report_events") && normalizedSql.includes("inner join reported_urls")) {
    const users = authDb ? await readAuthUsers(authDb) : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    const targetUserId = normalizedSql.includes("where report_events.reporter_user_id = ?") ? args[0] : "";
    const rows = data.report_events
      .filter((event) => !targetUserId || event.reporter_user_id === targetUserId)
      .slice()
      .sort(descByCreatedAt)
      .slice(0, 300)
      .map((event) => {
        const reportedUrl = data.reported_urls.find((row) => row.id === event.reported_url_id) || {};
        const user = userById.get(event.reporter_user_id) || {};

        return {
          confidence_score: reportedUrl.confidence_score,
          created_at: reportedUrl.created_at,
          description: event.description,
          domain: reportedUrl.domain,
          event_created_at: event.created_at,
          event_id: event.id,
          event_report_type: event.report_type,
          evidence_image_url: event.evidence_image_url,
          final_url: reportedUrl.final_url,
          normalized_url: reportedUrl.normalized_url,
          original_url: reportedUrl.original_url,
          report_count: reportedUrl.report_count,
          report_type: reportedUrl.report_type,
          reported_url_id: reportedUrl.id,
          reporter_ip_hash: event.reporter_ip_hash,
          reporter_user_id: event.reporter_user_id,
          status: reportedUrl.status,
          unique_reporters: reportedUrl.unique_reporters,
          url_created_at: reportedUrl.created_at,
          url_updated_at: reportedUrl.updated_at,
          username: user.username || "",
        };
      });

    return { results: rows };
  }

  return { results: [] };
}

async function executeRun({ args, loadData, saveData, sql }) {
  const data = await loadData();
  const normalizedSql = normalizeSql(sql);
  let changes = 0;

  if (normalizedSql.startsWith("insert into reported_urls")) {
    const [
      id,
      originalUrl,
      normalizedUrl,
      finalUrl,
      domain,
      urlHash,
      reportType,
      reportCount,
      uniqueReporters,
      confidenceScore,
      status,
      createdAt,
      updatedAt,
    ] = args;
    data.reported_urls.push({
      confidence_score: Number(confidenceScore || 0),
      created_at: createdAt,
      domain,
      final_url: finalUrl,
      id,
      normalized_url: normalizedUrl,
      original_url: originalUrl,
      report_count: Number(reportCount || 0),
      report_type: reportType,
      status,
      unique_reporters: Number(uniqueReporters || 0),
      updated_at: updatedAt,
      url_hash: urlHash,
    });
    changes = 1;
  } else if (normalizedSql.startsWith("insert into report_events")) {
    const [id, reportedUrlId, reportType, description, reporterIpHash, reporterUserId, evidenceImageUrl, createdAt] =
      args;
    data.report_events.push({
      created_at: createdAt,
      description,
      evidence_image_url: evidenceImageUrl,
      id,
      report_type: reportType,
      reported_url_id: reportedUrlId,
      reporter_ip_hash: reporterIpHash,
      reporter_user_id: reporterUserId,
    });
    changes = 1;
  } else if (normalizedSql.startsWith("update reported_urls set report_type = ?")) {
    const [reportType, reportCount, uniqueReporters, confidenceScore, updatedAt, reportedUrlId] = args;
    const row = data.reported_urls.find((item) => item.id === reportedUrlId);

    if (row) {
      row.report_type = reportType;
      row.report_count = Number(reportCount || 0);
      row.unique_reporters = Number(uniqueReporters || 0);
      row.confidence_score = Number(confidenceScore || 0);
      row.updated_at = updatedAt;
      changes = 1;
    }
  } else if (normalizedSql.startsWith("update reported_urls set status = ?")) {
    const [status, confidenceScore, updatedAt, reportedUrlId] = args;
    const row = data.reported_urls.find((item) => item.id === reportedUrlId);

    if (row) {
      row.status = status;
      row.confidence_score = Number(confidenceScore || 0);
      row.updated_at = updatedAt;
      changes = 1;
    }
  }

  if (changes > 0) {
    await saveData(data);
  }

  return { meta: { changes } };
}

async function readAuthUsers(authDb) {
  const data = await authDb.__readData?.();
  return Array.isArray(data?.users) ? data.users : [];
}

function normalizeData(value) {
  return {
    report_events: Array.isArray(value?.report_events) ? value.report_events : [],
    reported_urls: Array.isArray(value?.reported_urls) ? value.reported_urls : [],
  };
}

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function compareReportedUrls(left, right) {
  const statusDelta = statusRank(right.status) - statusRank(left.status);
  if (statusDelta) {
    return statusDelta;
  }

  const countDelta = Number(right.report_count || 0) - Number(left.report_count || 0);
  if (countDelta) {
    return countDelta;
  }

  return String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
}

function statusRank(status) {
  return {
    confirmed_malicious: 5,
    confirmed_suspicious: 4,
    under_review: 3,
    pending: 2,
    expired: 1,
    rejected: 0,
  }[status] || 0;
}

function descByCreatedAt(left, right) {
  return String(right.created_at || "").localeCompare(String(left.created_at || ""));
}
