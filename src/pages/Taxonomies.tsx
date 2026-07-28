import { NavigationBar } from "../components/NavigationBar";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { fetchAllteams } from "../redux/features/teamSlice";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { useAppDispatch, useAppSelector } from "../hooks";

export const Taxonomies = () => {
  const dispatch = useAppDispatch();
  const { allTeams } = useAppSelector((state) => state.team);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const teams = (allTeams as any[]) ?? [];
  const datasets = (allDatasets as any[]) ?? [];
  const firstTeamId: number | undefined = teams?.[0]?.id;
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(
    firstTeamId,
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<
    number | undefined
  >(undefined);
  const [datasetsLoaded, setDatasetsLoaded] = useState(false);

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

  // Auto-select when there's exactly one dataset; with several, wait for the
  // user to pick one before the conversation starts.
  useEffect(() => {
    if (selectedDatasetId == null && datasets.length === 1) {
      setSelectedDatasetId(Number(datasets[0]?.id));
    }
  }, [datasets, selectedDatasetId]);

  const teamOptions = useMemo(
    () =>
      teams.map((t: any) => ({
        label: t?.name ?? `Team ${t?.id}`,
        value: t?.id,
      })),
    [teams],
  );

  const datasetOptions = useMemo(
    () =>
      datasets.map((d: any) => ({
        label: d?.name ?? `Dataset ${d?.id}`,
        value: d?.id,
      })),
    [datasets],
  );

  // Team picker is hidden for now on the pre-annotation screen for all users;
  // the owning team is derived from the selected dataset (with selectedTeamId
  // kept only as a fallback for teamless datasets — see teamIdForChat below).
  const showTeamPicker = false;

  const selectedDataset = useMemo(
    () => datasets.find((d: any) => Number(d?.id) === Number(selectedDatasetId)),
    [datasets, selectedDatasetId],
  );

  // Let the backend derive the owning team from the dataset when it has one;
  // only forward a team when there's no dataset selected, or the dataset is
  // teamless (team_id == null) so freeze would otherwise 400.
  const teamIdForChat: number | undefined =
    selectedDatasetId != null && selectedDataset?.team_id != null
      ? undefined
      : selectedTeamId;

  useEffect(() => {
    dispatch(fetchAllteams());
    dispatch(fetchAllDatasets()).finally(() => setDatasetsLoaded(true));
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
          <div style={{ marginBottom: 12 }}>
            <Space align="center" size={12} wrap>
              {showTeamPicker && (
                <>
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
                </>
              )}

              <Typography.Text strong>Dataset</Typography.Text>
              <Select
                style={{ minWidth: 260 }}
                placeholder="Select a dataset"
                value={selectedDatasetId}
                options={datasetOptions}
                onChange={(v) => setSelectedDatasetId(v)}
                disabled={datasetOptions.length === 0}
                allowClear
                showSearch
                optionFilterProp="label"
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Link this conversation to a dataset.
              </Typography.Text>
            </Space>
          </div>
          <div className="flex gap-4 w-full h-[75vh]">
            <div className="flex w-[85%] h-full">
              <TaxonomyChatbot
                teamId={teamIdForChat}
                datasetId={selectedDatasetId}
                requireDataset={!datasetsLoaded || datasets.length > 0}
              />
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
