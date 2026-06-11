import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Breadcrumb, Empty, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import { NavigationBar } from "../../components/NavigationBar";
import { studyLogsApi } from "../../services/api";
import type { StudyLogSession } from "../../types/studyLogs";

const { Title, Text } = Typography;

export const StudyLogsUser: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StudyLogSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    studyLogsApi
      .listSessions(Number(userId))
      .then(setSessions)
      .catch((err) => setError(err?.response?.data?.detail ?? err.message ?? "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, [userId]);

  const columns: TableProps<StudyLogSession>["columns"] = [
    {
      title: "Session ID",
      dataIndex: "session_id",
      key: "session_id",
      render: (id: string, row) => (
        <a
          className="text-blue-600 hover:underline cursor-pointer font-mono text-xs"
          onClick={() => navigate(`/study-logs/${userId}/${row.session_id}`)}
        >
          {id}
        </a>
      ),
    },
    {
      title: "Events",
      dataIndex: "event_count",
      key: "event_count",
      align: "right",
      render: (count: number) => (
        <span className={count < 10 ? "text-red-500 font-semibold" : ""}>{count}</span>
      ),
    },
    {
      title: "Started",
      dataIndex: "first_event_at",
      key: "first_event_at",
      render: (ts: string) => (ts ? new Date(ts).toLocaleString() : "—"),
    },
    {
      title: "Duration",
      dataIndex: "duration_minutes",
      key: "duration_minutes",
      align: "right",
      render: (mins: number | null) => (mins != null ? `${mins} min` : "—"),
    },
    {
      title: "Phases",
      dataIndex: "phase_ids",
      key: "phase_ids",
      render: (phases: string[]) =>
        phases.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          phases.map((p) => (
            <Tag key={p} color="geekblue" className="font-mono text-xs">
              {p}
            </Tag>
          ))
        ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />
      <div className="max-w-5xl mx-auto py-8 px-4">
        <Breadcrumb
          className="mb-4 font-ibm-sans"
          items={[
            { title: <a onClick={() => navigate("/study-logs")}>Study Logs</a> },
            { title: `User ${userId}` },
          ]}
        />

        <div className="mb-6">
          <Title level={3} className="!mb-1 font-ibm-mono">
            Sessions
          </Title>
          <Text type="secondary">User ID {userId}</Text>
        </div>

        {error && (
          <Alert type="error" message={error} className="mb-4" showIcon />
        )}

        <Table
          dataSource={sessions}
          columns={columns}
          rowKey="session_id"
          loading={loading}
          locale={{ emptyText: <Empty description="No sessions found for this user" /> }}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          onRow={(row) => ({
            className: "cursor-pointer hover:bg-blue-50 transition-colors",
            onClick: () => navigate(`/study-logs/${userId}/${row.session_id}`),
          })}
        />
      </div>
    </div>
  );
};
