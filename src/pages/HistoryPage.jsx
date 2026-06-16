import {
  AlertTriangle,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SectionHeader from "../components/SectionHeader.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { useAccount } from "../lib/accountContext.jsx";
import {
  deleteAnalysisHistoryEntries,
  downloadAnalysisHistoryReport,
  loadAnalysisHistory,
  openAnalysisHistoryReport,
  printAnalysisHistoryReport,
  saveAnalysisHistoryEntry,
  subscribeAnalysisHistory,
} from "../lib/analysisHistory.js";
import { requestUrlAnalysis } from "../lib/linkRiskApi.js";
import { analyzeUrl } from "../lib/linkRiskAnalyzer.js";

const filterOptions = [
  { key: "all", label: "전체" },
  { key: "safe", label: "안전" },
  { key: "warn", label: "주의" },
  { key: "danger", label: "위험" },
];

const periodOptions = [
  { key: "all", label: "전체 기간" },
  { key: "today", label: "오늘" },
  { key: "week", label: "최근 7일" },
  { key: "month", label: "최근 30일" },
];

const PAGE_SIZE = 8;

export default function HistoryPage() {
  const { id: accountId, isLoggedIn } = useAccount();
  const historyAccountId = isLoggedIn ? accountId : "";
  const historyOptions = useMemo(() => ({ accountId: historyAccountId }), [historyAccountId]);
  const [historyRows, setHistoryRows] = useState(() => loadAnalysisHistory(historyOptions));
  const [activeFilter, setActiveFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    setHistoryRows(loadAnalysisHistory(historyOptions));
    setSelectedIds(new Set());
    setActionMessage("");

    return subscribeAnalysisHistory(() => {
      setHistoryRows(loadAnalysisHistory(historyOptions));
    }, historyOptions);
  }, [historyOptions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, periodFilter, searchQuery]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return historyRows.filter((row) => {
      const matchesStatus = activeFilter === "all" || row.tone === activeFilter;
      const matchesPeriod = isWithinPeriod(row.timestamp, periodFilter);
      const matchesQuery = !normalizedQuery || `${row.url} ${row.displayHost}`.toLowerCase().includes(normalizedQuery);

      return matchesStatus && matchesPeriod && matchesQuery;
    });
  }, [activeFilter, historyRows, periodFilter, searchQuery]);

  const summaryItems = useMemo(() => {
    const total = historyRows.length;
    const dangerCount = historyRows.filter((row) => row.tone === "danger").length;
    const warnCount = historyRows.filter((row) => row.tone === "warn").length;

    return [
      { label: "총 분석 수", value: total, meta: "저장된 실제 URL", icon: ShieldCheck, tone: "blue" },
      { label: "위험 링크", value: dangerCount, meta: formatPercent(dangerCount, total), icon: Siren, tone: "red" },
      { label: "주의 링크", value: warnCount, meta: formatPercent(warnCount, total), icon: AlertTriangle, tone: "warn" },
    ];
  }, [historyRows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredRows]);
  const pageNumbers = useMemo(() => getPageNumbers(currentPage, pageCount), [currentPage, pageCount]);
  const selectedRows = useMemo(
    () => historyRows.filter((row) => selectedIds.has(row.id)),
    [historyRows, selectedIds],
  );
  const selectedCount = selectedRows.length;
  const pageHasRows = visibleRows.length > 0;
  const isPageSelected = pageHasRows && visibleRows.every((row) => selectedIds.has(row.id));
  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredRows.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(historyRows.map((row) => row.id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [historyRows]);

  const dominantTone = useMemo(() => {
    const toneCounts = [
      { label: "위험", count: historyRows.filter((row) => row.tone === "danger").length, tone: "danger" },
      { label: "주의", count: historyRows.filter((row) => row.tone === "warn").length, tone: "warn" },
      { label: "안전", count: historyRows.filter((row) => row.tone === "safe").length, tone: "safe" },
    ].sort((left, right) => right.count - left.count);
    const topTone = toneCounts[0];
    const percent = formatRawPercent(topTone.count, historyRows.length);

    return {
      ...topTone,
      angle: `${Math.round(percent * 3.6)}deg`,
      percent,
    };
  }, [historyRows]);

  function handleTogglePageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (isPageSelected) {
        visibleRows.forEach((row) => next.delete(row.id));
      } else {
        visibleRows.forEach((row) => next.add(row.id));
      }

      return next;
    });
  }

  function handleToggleRowSelection(rowId) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }

      return next;
    });
  }

  function handleDeleteSelected() {
    if (selectedCount === 0) {
      return;
    }

    deleteAnalysisHistoryEntries([...selectedIds], historyOptions);
    setSelectedIds(new Set());
    setActionMessage(`선택한 분석 기록 ${selectedCount}건을 삭제했습니다.`);
  }

  async function handleReanalyzeSelected() {
    if (selectedCount === 0 || isReanalyzing) {
      return;
    }

    setIsReanalyzing(true);
    setActionMessage("");

    let remoteCount = 0;
    let localCount = 0;

    for (const row of selectedRows) {
      const mode = row.mode === "expert" ? "expert" : "normal";

      try {
        const nextAnalysis = await requestUrlAnalysis({ mode, url: row.url });
        saveAnalysisHistoryEntry(nextAnalysis, { ...historyOptions, mode, requestedUrl: row.url });
        remoteCount += 1;
      } catch {
        saveAnalysisHistoryEntry(analyzeUrl(row.url, { mode }), { ...historyOptions, mode, requestedUrl: row.url });
        localCount += 1;
      }
    }

    setIsReanalyzing(false);
    setSelectedIds(new Set());
    setActionMessage(
      localCount > 0
        ? `${remoteCount}건은 평판 DB로, ${localCount}건은 로컬 규칙으로 재분석했습니다.`
        : `선택한 분석 기록 ${remoteCount}건을 최신 결과로 재분석했습니다.`,
    );
  }

  return (
    <section className="history-page page-content">
      <SectionHeader
        title="분석 기록"
        subtitle="이전에 분석한 URL 결과를 확인하고 관리하세요."
      />

      <div className="dashboard-layout">
        <section className="panel history-table-panel">
          <div className="filter-row">
            <div className="status-filters">
              {filterOptions.map((option) => (
                <button
                  className={activeFilter === option.key ? "active" : ""}
                  key={option.key}
                  onClick={() => setActiveFilter(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="table-search">
              <Search size={15} />
              <input
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="URL 또는 도메인 검색"
                value={searchQuery}
              />
            </label>
            <label className="period-select">
              <SlidersHorizontal size={16} />
              <select
                aria-label="기간 선택"
                onChange={(event) => setPeriodFilter(event.target.value)}
                value={periodFilter}
              >
                {periodOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="bulk-action-row" aria-live="polite">
            <div>
              <strong>{selectedCount}건 선택</strong>
              <span>{actionMessage || "현재 페이지에서 필요한 기록을 선택해 관리하세요."}</span>
            </div>
            <div>
              <button
                disabled={selectedCount === 0 || isReanalyzing}
                onClick={handleReanalyzeSelected}
                type="button"
              >
                <RefreshCw className={isReanalyzing ? "is-spinning" : ""} size={15} />
                재분석
              </button>
              <button
                disabled={selectedCount === 0}
                onClick={() => openAnalysisHistoryReport(selectedRows)}
                type="button"
              >
                <FileText size={15} />
                보고서 보기
              </button>
              <button
                disabled={selectedCount === 0}
                onClick={() => printAnalysisHistoryReport(selectedRows)}
                type="button"
              >
                <Download size={15} />
                PDF 저장
              </button>
              <button
                className="danger-action"
                disabled={selectedCount === 0}
                onClick={handleDeleteSelected}
                type="button"
              >
                <Trash2 size={15} />
                삭제
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th aria-label="선택">
                    <input
                      aria-label="현재 페이지 전체 선택"
                      checked={isPageSelected}
                      disabled={!pageHasRows}
                      onChange={handleTogglePageSelection}
                      type="checkbox"
                    />
                  </th>
                  <th>URL</th>
                  <th>날짜</th>
                  <th>위험도</th>
                  <th>결과</th>
                  <th>리포트</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length > 0 ? (
                  visibleRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          aria-label={`${row.url} 선택`}
                          checked={selectedIds.has(row.id)}
                          onChange={() => handleToggleRowSelection(row.id)}
                          type="checkbox"
                        />
                      </td>
                      <td title={row.url}>{row.url}</td>
                      <td>{row.date}</td>
                      <td>
                        <span className={`score-line tone-${row.tone}`}>
                          <span style={{ width: `${row.score}%` }} />
                          {row.score}/100
                        </span>
                      </td>
                      <td>
                        <StatusPill tone={row.tone}>{row.result}</StatusPill>
                      </td>
                      <td>
                        <Link className="report-button" to={`/analysis?url=${encodeURIComponent(row.url)}`}>
                          리포트 보기
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="history-empty-state">
                        {historyRows.length === 0
                          ? "아직 저장된 분석 기록이 없습니다. URL을 분석하면 이곳에 실제 결과가 저장됩니다."
                          : "조건에 맞는 분석 기록이 없습니다."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination-row">
            <span>
              {pageStart}-{pageEnd} / 전체 {filteredRows.length}건
            </span>
            <div>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                type="button"
              >
                ‹
              </button>
              {pageNumbers.map((page) => (
                <button
                  className={currentPage === page ? "active" : ""}
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  type="button"
                >
                  {page}
                </button>
              ))}
              <button
                disabled={currentPage === pageCount}
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                type="button"
              >
                ›
              </button>
            </div>
          </div>
        </section>

        <aside className="summary-stack">
          <div className="panel summary-panel">
            <h2>분석 요약</h2>
            {summaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <article className={`summary-card tone-${item.tone}`} key={item.label}>
                  <Icon size={30} />
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.meta}</small>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="panel export-panel">
            <h2>가장 많은 결과</h2>
            <div className="delivery-chart">
              <div className={`tone-${dominantTone.tone}`} style={{ "--chart-angle": dominantTone.angle }}>
                <span>{historyRows.length > 0 ? dominantTone.label : "기록 없음"}</span>
                <strong>{dominantTone.percent}%</strong>
              </div>
            </div>
            <div className="export-actions">
              <button
                disabled={filteredRows.length === 0}
                onClick={() => openAnalysisHistoryReport(filteredRows)}
                type="button"
              >
                보고서 보기
                <FileText size={15} />
              </button>
              <button
                disabled={filteredRows.length === 0}
                onClick={() => downloadAnalysisHistoryReport(filteredRows)}
                type="button"
              >
                PDF로 저장
                <Download size={15} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function formatPercent(count, total) {
  return `${formatRawPercent(count, total)}%`;
}

function formatRawPercent(count, total) {
  if (total === 0) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

function isWithinPeriod(timestamp, period) {
  if (period === "all") {
    return true;
  }

  const now = new Date();
  const target = new Date(timestamp);

  if (period === "today") {
    return (
      target.getFullYear() === now.getFullYear() &&
      target.getMonth() === now.getMonth() &&
      target.getDate() === now.getDate()
    );
  }

  const elapsed = now.getTime() - target.getTime();
  const days = period === "week" ? 7 : 30;

  return elapsed <= days * 24 * 60 * 60 * 1000;
}

function getPageNumbers(currentPage, pageCount) {
  const visibleCount = Math.min(5, pageCount);
  const startPage = Math.max(1, Math.min(currentPage - 2, pageCount - visibleCount + 1));

  return Array.from({ length: visibleCount }, (_, index) => startPage + index);
}
