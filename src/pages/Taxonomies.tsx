import { NavigationBar } from "../components/NavigationBar";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchAllteams } from "../redux/features/teamSlice";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { useAppDispatch, useAppSelector } from "../hooks";

export const Taxonomies = () => {
  const dispatch = useAppDispatch();
  const { allTeams } = useAppSelector((state) => state.team);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);
  const isAdmin = user?.role === "admin";
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
  const [searchParams] = useSearchParams();
  const datasetIdParam = searchParams.get("dataset_id");
  const appliedDatasetParamRef = useRef(false);

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
  // Regular users: the owning team is derived from the selected dataset
  // (selectedTeamId kept only as a fallback for teamless datasets — see
  // teamIdForChat below). Admins get an explicit team picker so they choose
  // which team's label-space versions to view/manage.
  const showTeamPicker = isAdmin;

  const selectedDataset = useMemo(
    () =>
      datasets.find((d: any) => Number(d?.id) === Number(selectedDatasetId)),
    [datasets, selectedDatasetId],
  );

  // Keep the team selection in step with the chosen dataset. For regular users
  // this guarantees the team id used to build/submit a label space matches the
  // dataset's team. For admins it pre-fills the picker with the dataset's team
  // (still overridable) rather than ambushing them with an arbitrary team.
  useEffect(() => {
    const datasetTeamId = selectedDataset?.team_id;
    if (datasetTeamId != null) setSelectedTeamId(Number(datasetTeamId));
  }, [selectedDataset]);

  // Team the new conversation (and the label space it produces) is associated
  // with. An admin's label space is dataset-only — never associated with a team
  // — so we never forward a team for admins (the backend also keeps team_id null
  // for admins). For regular users, let the backend derive the owning team from
  // the dataset when it has one, forwarding a team only when there's no dataset
  // or the dataset is teamless.
  const teamIdForChat: number | undefined = isAdmin
    ? undefined
    : selectedDatasetId != null && selectedDataset?.team_id != null
      ? undefined
      : selectedTeamId;

  useEffect(() => {
    dispatch(fetchAllteams());
    dispatch(fetchAllDatasets()).finally(() => setDatasetsLoaded(true));
  }, []);

  return (
    <div>
      <NavigationBar />
      <div className="w-full flex pt-8 justify-center flex-col items-center">
        <div className="w-[80%]">
          <h1 className="text-xl font-semibold font-ibm-mono text-gray-800 mb-1">
            Pre-Annotation
          </h1>
          <p className="sub_description_text !leading-snug !mb-0">
            Create custom taxonomies and get suggested concepts for your
            annotations—chat below, then add them to your label space.
          </p>
        </div>

        <Card
          className="mt-4 mb-6 w-[80%] h-[80vh]"
          styles={{
            body: {
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            },
          }}
        >
          <div className="flex-shrink-0 mb-3">
            <Space align="center" size={12} wrap>
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

              {showTeamPicker && (
                <>
                  <Typography.Text strong>Team</Typography.Text>
                  <Select
                    style={{ minWidth: 220 }}
                    placeholder="Select a team"
                    value={selectedTeamId}
                    options={teamOptions}
                    onChange={(v) => setSelectedTeamId(v)}
                    disabled={teamOptions.length === 0}
                    showSearch
                    optionFilterProp="label"
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Choose which team's label space versions to view and manage.
                  </Typography.Text>
                </>
              )}
            </Space>
          </div>

          <div className="flex gap-4 w-full flex-1 min-h-0 overflow-hidden">
            <div className="flex flex-1 min-w-0 h-full">
              <TaxonomyChatbot
                teamId={teamIdForChat}
                datasetId={selectedDatasetId}
                requireDataset={!datasetsLoaded || datasets.length > 0}
              />
            </div>

            <div className="w-2/5 min-w-0 h-full">
              {/* Which team's versions the panel shows. Admins drive it from the
                  explicit Team picker (pre-filled with the dataset's team, still
                  overridable) so they aren't shown a team they didn't choose.
                  Regular users follow the selected dataset's team (authoritative
                  once a dataset is picked; may be undefined for a teamless
                  dataset → empty state), falling back to their team beforehand. */}
              <LabelSpace
                teamId={
                  isAdmin
                    ? selectedTeamId
                    : selectedDatasetId != null
                      ? (selectedDataset?.team_id as number | undefined)
                      : selectedTeamId
                }
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
