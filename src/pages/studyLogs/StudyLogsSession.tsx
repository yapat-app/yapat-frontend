import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Breadcrumb,
  Button,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { NavigationBar } from "../../components/NavigationBar";
import { studyLogsApi } from "../../services/api";
import type { StudyLogEventRow } from "../../types/studyLogs";
import { eventTypeColor } from "./eventTypeColor";

const { Title, Text } = Typography;

// All known event types for the filter dropdown
const ALL_EVENT_TYPES = [
  "session_start", "session_end", "phase_change", "log_dropped",
  "panel_enter", "panel_exit", "split_resize",
  "feed_active_snippet_change",
  "feedback_submit", "label_toggle", "label_clear",
  "vis_point_click", "vis_point_hover", "projection_method_change",
  "sampling_method_change", "visibility_threshold_change", "visibility_range_change",
  "color_property_change", "histogram_property_select", "histogram_multi_toggle",
  "retrain_manual_click", "retrain_complete",
  "audio_play_segment", "audio_volume_change", "audio_seek",
];

export const StudyLogsSession: React.FC = () => {
  const { userId, sessionId } = useParams<{ userId: string; sessionId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const filterType = searchParams.get("type") ?? undefined;
  const filterPhase = searchParams.get("phase") ?? undefined;

  const [events, setEvents] = useState<StudyLogEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Distinct phases observed in this session (populated after first load)
  const [phaseOptions, setPhaseOptions] = useState<string[]>([]);

  const fetchEvents = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    studyLogsApi
      .getSessionEvents(sessionId, {
        event_type: filterType,
        phase_id: filterPhase,
        limit: 1000, // fetch all; AntD paginates client-side
      })
      .then((page) => {
        setEvents(page.events);
        setTotal(page.total);
        // Collect distinct phases on first unfiltered load
        if (!filterType && !filterPhase) {
          const phases = [...new Set(page.events.map((e) => e.phase_id).filter(Boolean))] as string[];
          setPhaseOptions(phases);
        }
      })
      .catch((err) =>
        setError(err?.response?.data?.detail ?? err.message ?? "Failed to load events")
      )
      .finally(() => setLoading(false));
  }, [sessionId, filterType, filterPhase]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleExport = () => {
    if (!sessionId) return;
    setExporting(true);
    studyLogsApi.exportSessionCsv(sessionId);
    // Reset flag after a short delay (download is fire-and-forget)
    setTimeout(() => setExporting(false), 2000);
  };

  const setFilter = (key: "type" | "phase", value: string | undefined) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const columns: TableProps<StudyLogEventRow>["columns"] = [
    {
      title: "Time",
      dataIndex: "client_ts",
      key: "client_ts",
      width: 120,
      render: (ts: string) => {
        const d = new Date(ts);
        return (
          <span className="font-mono text-xs text-gray-500">
            {d.toLocaleTimeString()}
          </span>
        );
      },
    },
    {
      title: "Type",
      dataIndex: "event_type",
      key: "event_type",
      render: (type: string) => (
        <Tag color={eventTypeColor(type)} className="font-mono text-xs">
          {type}
        </Tag>
      ),
    },
    {
      title: "Phase",
      dataIndex: "phase_id",
      key: "phase_id",
      render: (phase: string | null) =>
        phase ? <span className="font-mono text-xs">{phase}</span> : <Text type="secondary">—</Text>,
    },
    {
      title: "Snippet",
      dataIndex: "snippet_id",
      key: "snippet_id",
      align: "right",
      render: (id: number | null) => (id != null ? id : <Text type="secondary">—</Text>),
    },
    {
      title: "Duration (ms)",
      dataIndex: "duration_ms",
      key: "duration_ms",
      align: "right",
      render: (ms: number | null) => (ms != null ? ms : <Text type="secondary">—</Text>),
    },
    {
      title: "Payload",
      dataIndex: "payload",
      key: "payload",
      ellipsis: true,
      render: (payload: Record<string, unknown> | null) => {
        if (!payload) return <Text type="secondary">—</Text>;
        const str = JSON.stringify(payload);
        return (
          <span className="font-mono text-xs text-gray-500">
            {str.length > 60 ? str.slice(0, 60) + "…" : str}
          </span>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />
      <div className="max-w-7xl mx-auto py-8 px-4">
        <Breadcrumb
          className="mb-4 font-ibm-sans"
          items={[
            { title: <a onClick={() => navigate("/study-logs")}>Study Logs</a> },
            { title: <a onClick={() => navigate(`/study-logs/${userId}`)}>User {userId}</a> },
            { title: <span className="font-mono text-xs">{sessionId?.slice(0, 8)}…</span> },
          ]}
        />

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Title level={3} className="!mb-1 font-ibm-mono">
              Session Events
            </Title>
            <Text type="secondary" className="font-mono text-xs">
              {sessionId}
            </Text>
            <div className="mt-1">
              <Text type="secondary">{total} event{total !== 1 ? "s" : ""}</Text>
            </div>
          </div>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
          >
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Space className="mb-4" wrap>
          <Select
            allowClear
            placeholder="Filter by event type"
            style={{ width: 240 }}
            value={filterType}
            onChange={(val) => setFilter("type", val)}
            options={ALL_EVENT_TYPES.map((t) => ({ label: t, value: t }))}
          />
          {phaseOptions.length > 0 && (
            <Select
              allowClear
              placeholder="Filter by phase"
              style={{ width: 200 }}
              value={filterPhase}
              onChange={(val) => setFilter("phase", val)}
              options={phaseOptions.map((p) => ({ label: p, value: p }))}
            />
          )}
        </Space>

        {error && (
          <Alert type="error" message={error} className="mb-4" showIcon />
        )}

        <Table
          dataSource={events}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          locale={{ emptyText: <Empty description="No events match the current filters" /> }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} events` }}
          expandable={{
            expandedRowRender: (row) => (
              <pre className="text-xs bg-blue-50 p-3 rounded border border-blue-100 overflow-auto max-h-48">
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            ),
            rowExpandable: (row) => row.payload != null,
          }}
        />
      </div>
    </div>
  );
};
