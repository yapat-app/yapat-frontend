import React, { useEffect, useState, useRef } from "react";
import { Card, Button, Skeleton, Tooltip, Spin, Alert, message } from "antd";
import {
  LeftOutlined,
  RightOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import type { Layout, Data } from "plotly.js";
import { useAppSelector, useAppDispatch } from "../hooks";
import Plot from "react-plotly.js";
import {
  setCurrentSuggestionIndex,
  nextSuggestion,
  prevSuggestion,
  fetchCurrentSnippetAudio,
  clearCurrentSnippetAudio,
  submitLabel,
  clearSubmitLabelStatus,
  selectSpecies,
  retrainModel,
  getHistogram,
} from "../redux/features/wssedSlice";

import { getAllDatasetSnippetSets } from "../redux/features/embeddingSlice";
import type { PredictionHistogram } from "../types";

const AudioPredictionHistogram: React.FC<{
  histogram: PredictionHistogram | null;
}> = ({ histogram }) => {
  if (!histogram) return null;

  const { bin_edges, counts } = histogram;

  // Convert bin edges into readable labels
  const binLabels =
    bin_edges?.slice(0, -1).map((edge, index) => {
      const nextEdge = bin_edges[index + 1];
      return `${edge.toFixed(1)} - ${nextEdge.toFixed(1)}`;
    }) ?? [];

  const plotData: Data[] = [
    {
      type: "bar",
      x: binLabels,
      y: counts,
      marker: {
        color: "#3b82f6",
        line: { color: "#1e40af", width: 1 },
      },
      hovertemplate:
        "Confidence Range: %{x}<br>" + "Snippets: %{y}<br>" + "<extra></extra>",
    },
  ];

  const layout: Partial<Layout> = {
    xaxis: {
      title: { text: "Confidence Range" },
    },
    yaxis: {
      title: { text: "Number of Snippets" },
    },
    bargap: 0.1,
    margin: { t: 10, l: 40, r: 30, b: 70 },
  };

  return (
    <div className="w-full py-4">
      <Plot
        data={plotData}
        layout={layout}
        config={{ displayModeBar: false }}
        style={{ width: "100%", height: "20vh" }}
      />
    </div>
  );
};

export const WssedAudio = ({
  modelTrained,
}: {
  modelTrained: boolean;
  modelTraining: boolean;
  remaining: number;
  handleRetrainClick: () => void;
}) => {
  const dispatch = useAppDispatch();
  const [remaining, setRemaining] = useState(5);

  const {
    selectedSpecies,
    activeLearning,
    currentSuggestionIndex,
    currentSnippetId,
    currentSnippetAudio,
    audioLoading,
    audioError,
    submitLabelLoading,
    submitLabelError,
    submitLabelSuccess,
    modelTraining,
    histogram,
    histogramLoading,
  } = useAppSelector((state) => state.wssed);

  const prevModelTrainingRef = useRef<boolean>(modelTraining);

  const { datasetDirectories } = useAppSelector((state) => state.dataset);
  const datasetIdFromDirectory = datasetDirectories?.dataset_id;

  const { snippetSets, loading: snippetSetsLoading } = useAppSelector(
    (state) => state.embedding,
  );

  const snippetSetId = snippetSets?.[0]?.id ?? null;

  const suggestions = activeLearning?.suggestions ?? [];
  const hasSuggestions = suggestions.length > 0;

  const shouldAdvanceAfterSubmitRef = useRef(false);

  const handleRetrain = () => {
    dispatch(
      retrainModel({
        snippet_set_id: Number(snippetSetId),
        species_name: selectedSpecies
          ? selectedSpecies.charAt(0).toUpperCase() + selectedSpecies.slice(1)
          : "",
        dataset_id: Number(datasetIdFromDirectory),
        device: "cpu",
        epochs: 5,
        lr: 0.001,
      }),
    );
  };

  const handleResponse = () => {
    if (remaining === 1) {
      handleRetrain();
      return;
    }
    setRemaining((prev) => Math.max(prev - 1, 0));
  };

  useEffect(() => {
    if (prevModelTrainingRef.current && !modelTraining) {
      setRemaining(5);
    }
    prevModelTrainingRef.current = modelTraining;
  }, [modelTraining]);

  useEffect(() => {
    const firstSpecies = datasetDirectories?.species?.[0]?.name;
    if (!selectedSpecies && firstSpecies) {
      dispatch(selectSpecies(firstSpecies));
    }
  }, [datasetDirectories, selectedSpecies, dispatch]);

  useEffect(() => {
    if (!datasetIdFromDirectory) return;
    dispatch(getAllDatasetSnippetSets(Number(datasetIdFromDirectory)));
  }, [datasetIdFromDirectory, selectedSpecies, dispatch]);

  // Auto-select first suggestion when suggestions arrive
  useEffect(() => {
    if (hasSuggestions && currentSnippetId == null) {
      dispatch(setCurrentSuggestionIndex(0));
    }
  }, [hasSuggestions, currentSnippetId, dispatch]);

  // Fetch audio whenever current snippet changes
  useEffect(() => {
    console.log("Current snippet ID changed:", currentSnippetId);

    if (currentSnippetId == null) {
      dispatch(clearCurrentSnippetAudio());
      return;
    }

    dispatch(fetchCurrentSnippetAudio(currentSnippetId));
  }, [currentSnippetId, dispatch]);

  useEffect(() => {
    if (currentSnippetId == null) return;

    // audio got cleared by reducers? fetch again
    if (!audioLoading && !audioError && currentSnippetAudio == null) {
      dispatch(fetchCurrentSnippetAudio(currentSnippetId));
    }
  }, [
    currentSnippetId,
    currentSnippetAudio,
    audioLoading,
    audioError,
    dispatch,
  ]);

  useEffect(() => {
    const wasTraining = prevModelTrainingRef.current;
    prevModelTrainingRef.current = modelTraining;

    // only on transition true -> false
    if (wasTraining && !modelTraining) {
      // if we have a snippet but audio is missing, fetch it
      if (currentSnippetId != null && !currentSnippetAudio && !audioLoading) {
        dispatch(fetchCurrentSnippetAudio(currentSnippetId));
      }
    }
  }, [
    modelTraining,
    currentSnippetId,
    currentSnippetAudio,
    audioLoading,
    dispatch,
  ]);

  useEffect(() => {
    console.log(
      "Active learning state changed:",
      activeLearning?.model_info.species_model_id,
    );
    if (activeLearning?.model_info.species_model_id) {
      dispatch(
        getHistogram({
          snippet_set_id: Number(snippetSetId),
          model_id: Number(activeLearning.model_info.species_model_id),
        }),
      );
    }
  }, [activeLearning]);

  // Toast + advance ONLY after submit succeeds
  useEffect(() => {
    if (submitLabelSuccess) {
      message.success("Label submitted successfully");

      if (shouldAdvanceAfterSubmitRef.current) {
        shouldAdvanceAfterSubmitRef.current = false;
        if (hasSuggestions) dispatch(nextSuggestion());
      }

      dispatch(clearSubmitLabelStatus());
    }
  }, [submitLabelSuccess, hasSuggestions, dispatch]);

  // Toast on submit error (no advance)
  useEffect(() => {
    if (submitLabelError) {
      message.error(`Label submission failed: ${submitLabelError}`);
      shouldAdvanceAfterSubmitRef.current = false;
      dispatch(clearSubmitLabelStatus());
    }
  }, [submitLabelError, dispatch]);

  const onPrev = () => {
    if (!hasSuggestions) return;
    dispatch(prevSuggestion());
  };

  const onNext = () => {
    if (!hasSuggestions) return;
    dispatch(nextSuggestion());
  };

  const onAcceptReject = (action: "accept" | "reject") => {
    if (!currentSnippetId || !selectedSpecies || !datasetIdFromDirectory) {
      message.warning("Missing snippet/species/dataset to submit label");
      return;
    }

    if (!snippetSetId) {
      message.warning("No snippet set found for this dataset.");
      return;
    }

    shouldAdvanceAfterSubmitRef.current = true;

    dispatch(
      submitLabel({
        snippet_set_id: Number(snippetSetId),
        species_name:
          selectedSpecies.charAt(0).toUpperCase() + selectedSpecies.slice(1),
        dataset_id: Number(datasetIdFromDirectory),
        snippet_id: currentSnippetId,
        label: action === "accept" ? 1 : 0,
      }),
    );

    handleResponse();
  };

  const isPrevDisabled =
    !hasSuggestions || currentSuggestionIndex <= 0 || submitLabelLoading;

  const isNextDisabled =
    !hasSuggestions ||
    currentSuggestionIndex >= suggestions.length - 1 ||
    submitLabelLoading;

  const isLabelDisabled =
    !hasSuggestions ||
    audioLoading ||
    submitLabelLoading ||
    snippetSetsLoading ||
    !snippetSetId;

  if (!modelTrained) {
    return (
      <Card className="w-[60%] rounded-xl shadow-sm relative">
        <div className="blur-[2px]">
          <div className="mb-2 w-full flex justify-center">
            <Skeleton.Input style={{ width: 200, height: 28 }} />
          </div>
          <Skeleton.Input style={{ width: 150, height: 20 }} className="mb-2" />

          <div className="mb-4">
            <Skeleton.Node style={{ width: "100%", height: 260 }} />
          </div>

          <div className="flex h-full gap-10">
            <div className="relative flex items-center justify-center gap-4 w-[65%]">
              <Skeleton.Button />
              <Skeleton.Node style={{ width: "100%", height: 250 }} />
              <Skeleton.Button />
            </div>

            <div className="h-inherit w-[32%]">
              <div className="w-full flex h-full flex-col justify-center items-center">
                <div className="flex gap-3 mt-5 w-full">
                  <Skeleton.Button style={{ width: "50%", height: 100 }} />
                  <Skeleton.Button style={{ width: "50%", height: 100 }} />
                </div>
                <Skeleton.Input
                  style={{ width: "100%", height: 40 }}
                  className="mt-5"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-white/40 flex items-center justify-center z-10 rounded-xl">
          <div className="bg-white shadow-lg rounded-lg p-6 w-[20vw] text-center border border-gray-200">
            {modelTraining ? (
              <Spin />
            ) : (
              <div>
                <h4 className="text-base font-ibm-mono font-semibold text-gray-800 mb-2">
                  Start Model Training
                </h4>
                <p className="text-sm text-gray-600 font-ibm-sans">
                  Start the model training to view results and begin reviewing
                  audio snippets.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  //   if (!selectedSpecies) {
  //     return (
  //       <Card className="w-[60%] rounded-xl shadow-sm relative">
  //         <SelectSpeciesPlaceholder />
  //       </Card>
  //     );
  //   }

  return (
    <Card className="w-[60%] rounded-xl shadow-sm relative">
      <div>
        <div className="mb-2 w-full flex justify-center">
          <h2 className="text-xl font-semibold font-ibm-mono text-gray-900">
            {selectedSpecies}
          </h2>
        </div>

        <h4 className="text-sm font-semibold font-ibm-sans text-gray-800 mb-2">
          Audio snippet review
        </h4>

        {histogramLoading ? (
          <div className="w-full flex items-center justify-center">
            <Spin />
          </div>
        ) : (
          histogram && <AudioPredictionHistogram histogram={histogram} />
        )}

        <div className="flex h-full gap-10">
          <div className="relative flex items-center justify-center gap-4 w-[65%]">
            <Tooltip title="Previous snippet">
              <Button
                icon={<LeftOutlined />}
                onClick={onPrev}
                disabled={isPrevDisabled || audioLoading}
              />
            </Tooltip>

            <div className="w-full flex items-center justify-center">
              {audioError && (
                <Alert
                  type="error"
                  showIcon
                  message="Audio load failed"
                  description={audioError}
                  className="w-full"
                />
              )}

              {!audioError && audioLoading && (
                <div className="w-full flex items-center justify-center h-[250px]">
                  <Spin />
                </div>
              )}

              {!audioError && !audioLoading && currentSnippetAudio && (
                <SpectrogramPlayer
                  key={currentSnippetAudio}
                  src={currentSnippetAudio}
                  sampleRate={16000}
                  specHeight={250}
                  navHeight={60}
                  navigator={false}
                  settings={false}
                  colormap="viridis"
                />
              )}

              {!audioError && !audioLoading && !currentSnippetAudio && (
                <div className="w-full flex items-center justify-center h-[250px] text-sm text-gray-500">
                  No audio loaded
                </div>
              )}
            </div>

            <Tooltip title="Next snippet">
              <Button
                icon={<RightOutlined />}
                onClick={onNext}
                disabled={isNextDisabled || audioLoading}
              />
            </Tooltip>
          </div>

          <div className="h-inherit w-[32%]">
            <div className="w-full flex h-full flex-col justify-center items-center">
              <div className="flex gap-5 mt-5 w-full justify-center">
                <Tooltip title={isLabelDisabled ? "Loading..." : "Reject"}>
                  <Button
                    danger
                    className="w-[35%]! h-[60px]!"
                    onClick={() => onAcceptReject("reject")}
                    disabled={isLabelDisabled}
                  >
                    <CloseOutlined style={{ fontSize: 25 }} />
                  </Button>
                </Tooltip>
                <Tooltip title={isLabelDisabled ? "Loading..." : "Accept"}>
                  <Button
                    type="primary"
                    className="flex-1 w-[35%]! h-[60px]! border"
                    onClick={() => onAcceptReject("accept")}
                    disabled={isLabelDisabled}
                  >
                    <CheckOutlined style={{ fontSize: 25 }} />
                  </Button>
                </Tooltip>
              </div>

              {!modelTraining ? (
                <div className="mt-5">
                  <p className="text-[11px] text-gray-500 text-center mt-2">
                    Next model retrain after {""}
                    <span className="font-bold">{remaining}</span> responses.
                    <br />
                    {remaining < 5 && (
                      <a className="font-medium" onClick={handleRetrain}>
                        retrain now?
                      </a>
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-5">
                  <p className="text-[11px] text-gray-500 text-center mt-2">
                    retraining...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
