import { NavigationBar } from "../components/NavigationBar";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { fetchAllteams } from "../redux/features/teamSlice";
import { useAppDispatch, useAppSelector } from "../hooks";

export const Taxonomies = () => {
  const dispatch = useAppDispatch();
  const { allTeams } = useAppSelector((state) => state.team);
  const { user } = useAppSelector((state) => state.auth);
  const teams = (allTeams as any[]) ?? [];
  const firstTeamId: number | undefined = teams?.[0]?.id;
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(
    firstTeamId,
  );

  // Keep selection in sync when teams load/refresh
  useEffect(() => {
    if (selectedTeamId == null && firstTeamId != null) {
      setSelectedTeamId(firstTeamId);
    }
  }, [firstTeamId, selectedTeamId]);

  // Persist selection for other screens (e.g. annotate)
  useEffect(() => {
    if (selectedTeamId != null) {
      localStorage.setItem("preAnnotationTeamId", String(selectedTeamId));
    }
  }, [selectedTeamId]);

  const teamOptions = useMemo(
    () =>
      teams.map((t: any) => ({
        label: t?.name ?? `Team ${t?.id}`,
        value: t?.id,
      })),
    [teams],
  );

  const showTeamPicker = teamOptions.length > 1 || user?.role === "admin";

  useEffect(() => {
    dispatch(fetchAllteams());
  }, []);

  return (
    <div>
      <NavigationBar />
      <div className="w-full flex pt-10 justify-center flex-col items-center ">
        <h1 className="w-[80%] text-xl font-semibold font-ibm-mono text-gray-800 mb-0 ">
          Pre-Annotation
        </h1>

        <div className="w-[80%] py-2  border-gray-200">
          <p className="sub_description_text">
            Create custom taxonomies and get suggested concepts for your
            annotations—chat below, then add them to your label space.
          </p>
        </div>

        <Card className="my-4 w-[80%] h-[80vh] ">
          {showTeamPicker && (
            <div style={{ marginBottom: 12 }}>
              <Space align="center" size={12} wrap>
                <Typography.Text strong>Target team</Typography.Text>
                <Select
                  style={{ minWidth: 260 }}
                  placeholder="Select a team"
                  value={selectedTeamId}
                  options={teamOptions}
                  onChange={(v) => setSelectedTeamId(v)}
                  disabled={teamOptions.length === 0}
                  showSearch
                  optionFilterProp="label"
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  This team will own the frozen label space taxonomy.
                </Typography.Text>
              </Space>
            </div>
          )}
          <div className="flex gap-4 w-full h-[75vh]">
            <div className="flex w-[85%] h-full">
              <TaxonomyChatbot teamId={selectedTeamId} />
            </div>

            <div className="w-[40%] h-inherit">
              <LabelSpace />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
