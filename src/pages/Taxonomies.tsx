import { NavigationBar } from "../components/NavigationBar";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchAllteams } from "../redux/features/teamSlice";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { DatasetCustomQuickLabels } from "../components/DatasetCustomQuickLabels";
import { useAppDispatch, useAppSelector } from "../hooks";

export const Taxonomies = () => {
  const dispatch = useAppDispatch();
  const { allTeams } = useAppSelector((state) => state.team);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { conversationFreezed } = useAppSelector(
    (state) => state.customTaxonomy,
  );
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
  const [quickLabelsRefresh, setQuickLabelsRefresh] = useState(0);
  const [searchParams] = useSearchParams();
  const datasetIdParam = searchParams.get("dataset_id");
  const appliedDatasetParamRef = useRef(false);

  // Keep selection in sync when teams load/refresh
  useEffect(() => {
    if (selectedTeamId == null && firstTeamId != null) {
      setSelectedTeamId(firstTeamId);
    }
  }, [firstTeamId, selectedTeamId]);

  // A conversation freeze writes the frozen label space into the dataset's
  // quick_labels on the backend — re-fetch the custom quick labels panel so it
  // reflects the newly added labels.
  useEffect(() => {
    if (conversationFreezed) {
      setQuickLabelsRefresh((v) => v + 1);
    }
  }, [conversationFreezed]);

  // Persist selection for other screens (e.g. annotate)
  useEffect(() => {
    if (selectedTeamId != null) {
      localStorage.setItem("preAnnotationTeamId", String(selectedTeamId));
    }
  }, [selectedTeamId]);

  // Preselect the dataset passed in the URL (e.g. from the annotation feed's
  // "edit label space" pencil). Applied once, once the datasets have loaded so
  // the option exists in the dropdown.
  useEffect(() => {
    if (appliedDatasetParamRef.current || !datasetIdParam) return;
    const id = Number(datasetIdParam);
    if (!Number.isFinite(id)) return;
    if (datasets.some((d: any) => Number(d?.id) === id)) {
      setSelectedDatasetId(id);
      appliedDatasetParamRef.current = true;
    }
  }, [datasetIdParam, datasets]);

  // Auto-select when there's exactly one dataset; with several, wait for the
  // user to pick one before the conversation starts.
  useEffect(() => {
    if (datasetIdParam && !appliedDatasetParamRef.current) return;
    if (selectedDatasetId == null && datasets.length === 1) {
      setSelectedDatasetId(Number(datasets[0]?.id));
    }
  }, [datasets, selectedDatasetId, datasetIdParam]);

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
    () =>
      datasets.find((d: any) => Number(d?.id) === Number(selectedDatasetId)),
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

        <Card
          className="my-4 w-[80%] h-[80vh] "
          styles={{
            body: {
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            },
          }}
        >
          <div className="flex-shrink-0" style={{ marginBottom: 12 }}>
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

          {selectedDataset && (
            <div className="flex-shrink-0">
              <DatasetCustomQuickLabels
                dataset={selectedDataset}
                refreshSignal={quickLabelsRefresh}
              />
            </div>
          )}

          <div className="flex gap-4 w-full flex-1 min-h-0 overflow-hidden">
            <div className="flex flex-1 min-w-0 h-full">
              <TaxonomyChatbot
                teamId={teamIdForChat}
                datasetId={selectedDatasetId}
                requireDataset={!datasetsLoaded || datasets.length > 0}
              />
            </div>

            <div className="w-2/5 min-w-0 h-full">
              <LabelSpace />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
