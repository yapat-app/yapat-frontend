import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Empty, Table, Typography } from "antd";
import type { TableProps } from "antd";
import { NavigationBar } from "../../components/NavigationBar";
import { studyLogsApi } from "../../services/api";
import type { StudyLogUser } from "../../types/studyLogs";

const { Title, Text } = Typography;

export const StudyLogsIndex: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<StudyLogUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    studyLogsApi
      .listUsers()
      .then(setUsers)
      .catch((err) => setError(err?.response?.data?.detail ?? err.message ?? "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  const columns: TableProps<StudyLogUser>["columns"] = [
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
      render: (name: string, row) => (
        <a
          className="text-blue-600 hover:underline cursor-pointer font-mono"
          onClick={() => navigate(`/study-logs/${row.user_id}`)}
        >
          {name}
        </a>
      ),
    },
    {
      title: "Sessions",
      dataIndex: "session_count",
      key: "session_count",
      align: "right",
    },
    {
      title: "Total events",
      dataIndex: "event_count",
      key: "event_count",
      align: "right",
    },
    {
      title: "Last seen",
      dataIndex: "last_seen",
      key: "last_seen",
      render: (ts: string) =>
        ts ? new Date(ts).toLocaleString() : "—",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Title level={3} className="!mb-1 font-ibm-mono">
            Study Logs
          </Title>
          <Text type="secondary">Participants with recorded interaction events</Text>
        </div>

        {error && (
          <Alert type="error" message={error} className="mb-4" showIcon />
        )}

        <Table
          dataSource={users}
          columns={columns}
          rowKey="user_id"
          loading={loading}
          locale={{ emptyText: <Empty description="No participants have logged events yet" /> }}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          onRow={(row) => ({
            className: "cursor-pointer hover:bg-blue-50 transition-colors",
            onClick: () => navigate(`/study-logs/${row.user_id}`),
          })}
        />
      </div>
    </div>
  );
};
