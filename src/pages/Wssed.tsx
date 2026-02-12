import { NavigationBar } from "../components/NavigationBar";
import Card from "antd/es/card/Card";
import {
  LeftOutlined,
  RightOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import Plot from "react-plotly.js";
import type { Layout, Data } from "plotly.js";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import { Select, Modal, Button, Tooltip, message, Skeleton, Spin } from "antd";
import type { SelectProps } from "antd/es/select";

import { useEffect, useState, useRef } from "react";
import { useAppDispatch } from "../hooks";
import { useAppSelector } from "../hooks";
import { DatasetFolderStructure } from "../components/DatasetFolderStructure";
import { WSLModelTraining } from "../components/WSLModelTraining";
import { set } from "lodash";

const audioUrl =
  "blob:http://localhost:3000/446ce7ce-6cbb-478a-a9fd-7cd8a16b1e14";
const speciesBags = [
  { value: "birds_europe", label: "Birds (Europe) - 1,200 species" },
  { value: "mammals_na", label: "Mammals (North America) - 450 species" },
  { value: "amphibians_global", label: "Amphibians (Global) - 8,000 species" },
  { value: "fish_ocean", label: "Ocean Fish - 34,000 species" },
  { value: "insects_tropical", label: "Tropical Insects - 500K species" },
  {
    value: "plants_mediterranean",
    label: "Mediterranean Plants - 25,000 species",
  },
  { value: "reptiles_australia", label: "Australian Reptiles - 900 species" },
];

type AudioFile = {
  location: string;
};

type DataFolder = {
  folderName: string;
  audioFiles: AudioFile[];
};

const dataFolder: DataFolder[] = [
  {
    folderName: "European Robin",
    audioFiles: [
      { location: "ER_20190911_024500.wav" },
      { location: "ER_20190912_061200.wav" },
      { location: "ER_20190913_193000.wav" },
    ],
  },
  {
    folderName: "Common Blackbird",
    audioFiles: [
      { location: "CB_20190821_054300.wav" },
      { location: "CB_20190822_182100.wav" },
    ],
  },
  {
    folderName: "Crow",
    audioFiles: Array.from({ length: 12 }).map((_, i) => ({
      location: `GT_2019100${i + 1}_070000.wav`,
    })),
  },
];

type SpeciesPrediction = {
  species: string;
  avgConfidence: number; // 0–1
  predictionCount: number;
};

const AudioPredictionHistogram: React.FC = () => {
  const snippetConfidences = [
    // High confidence predictions (near 1) - 18 snippets
    0.95, 0.92, 0.88, 0.91, 0.94, 0.91, 0.9, 0.84, 0.5, 0.94, 0.89, 0.93, 0.87,
    0.96, 0.9, 0.85, 0.92, 0.88, 0.94, 0.91, 0.89, 0.93, 0.86,

    // Low confidence predictions (near 0) - 15 snippets
    0.08, 0.12, 0.05, 0.15, 0.09, 0.11, 0.07, 0.14, 0.06, 0.13, 0.1, 0.08, 0.12,
    0.09, 0.11,

    // Uncertain/middle range (needs annotation) - 17 snippets
    0.45, 0.52, 0.38, 0.61, 0.48, 0.55, 0.42, 0.58, 0.35, 0.64, 0.5, 0.43, 0.57,
    0.4, 0.62, 0.47, 0.53,
  ];

  const plotData: Data[] = [
    {
      type: "histogram",
      x: snippetConfidences,
      nbinsx: 20, // Number of bins
      marker: {
        color: "#3b82f6",
        line: {
          color: "#1e40af",
          width: 1,
        },
      },
      hovertemplate:
        "Confidence: %{x:.2f}<br>" + "Count: %{y}<br>" + "<extra></extra>",
    },
  ];

  const layout: Partial<Layout> = {
    title: {
      //   text: "Snippet Prediction Confidence Distribution",
      font: { size: 16 },
    },
    xaxis: {
      title: "Confidence Score",
      range: [0, 1],
      tickformat: ".1f",
    },
    yaxis: {
      title: "Number of Snippets",
    },
    bargap: 0.05,
    // height: 150,
    margin: { t: 10, l: 40, r: 30, b: 40 },
    shapes: [
      // Add lines to mark annotation zones
      //   {
      //     type: "line",
      //     x0: 0.3,
      //     x1: 0.3,
      //     y0: 0,
      //     y1: 1,
      //     yref: "paper",
      //     line: {
      //       color: "#f59e0b",
      //       width: 2,
      //       dash: "dash",
      //     },
      //   },
      //   {
      //     type: "line",
      //     x0: 0.7,
      //     x1: 0.7,
      //     y0: 0,
      //     y1: 1,
      //     yref: "paper",
      //     line: {
      //       color: "#f59e0b",
      //       width: 2,
      //       dash: "dash",
      //     },
      //   },
    ],
    // annotations: [
    //   {
    //     x: 0.15,
    //     y: 1.05,
    //     yref: "paper",
    //     text: "Low Confidence",
    //     showarrow: false,
    //     font: { size: 10, color: "#6b7280" },
    //   },
    //   {
    //     x: 0.5,
    //     y: 1.05,
    //     yref: "paper",
    //     text: "Needs Review",
    //     showarrow: false,
    //     font: { size: 10, color: "#f59e0b" },
    //   },
    //   {
    //     x: 0.85,
    //     y: 1.05,
    //     yref: "paper",
    //     text: "High Confidence",
    //     showarrow: false,
    //     font: { size: 10, color: "#6b7280" },
    //   },
    // ],
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

export const Wssed = () => {
  const dispatch = useAppDispatch();
  const [showDataset, setShowDataset] = useState(true);
  const [showTraining, setShowTraining] = useState(true);
  const [selectedBags, setSelectedBags] = useState<string | null>(null);
  const { currentSnippetAudio } = useAppSelector((state: any) => state.snippet);
  const [remaining, setRemaining] = useState(5);
  const [enableWSL, setEnableWSL] = useState(false);
  const [modelTraining, setModelTraining] = useState(false);
  const [modelTrained, setIsModelTrained] = useState(false);
  const prevModelTrainingRef = useRef(modelTraining);

  const handleChangeSpecies = (value: string) => {
    console.log(`Selected species bag: ${value}`);
    setSelectedBags(value);
  };

  const handleResponse = (action: "accept" | "reject") => {
    if (remaining === 1) {
      setModelTraining(true);
      return;
    }
    setRemaining((prev) => Math.max(prev - 1, 0));
  };

  const handleRetrainClick = () => {
    setModelTraining(true);
  };

  const trainingHandler = () => {
    const timer = setTimeout(() => {
      setIsModelTrained(true);
      message.success("Model Successfully Trained!");
    }, 2000);

    return () => {
      setIsModelTrained(false);
      clearTimeout(timer);
    };
  };

  useEffect(() => {
    if (prevModelTrainingRef.current !== true && modelTraining) {
      const timer = setTimeout(() => {
        setRemaining(5);
        setModelTraining(false);
        message.success("Model retrained with latest annotations!");
      }, 2000);

      return () => clearTimeout(timer);
    }

    // Update ref for next comparison
    prevModelTrainingRef.current = modelTraining;
  }, [modelTraining]);

  useEffect(() => {
    if (dataFolder.length >= 2) {
      setEnableWSL(true);
    } else {
      setEnableWSL(false);
    }
  }, [dataFolder.length]);

  return (
    <div>
      <NavigationBar />

      <div className="py-10 flex justify-center w-full bg-gray-50 ">
        <aside
          className={`${showDataset ? "w-[18%]" : "w-fit"} h-inherit border-r border-[#F0F0F0] bg-white flex flex-col`}
        >
          {/* Toggle button */}
          {!showDataset && (
            <div className="justify-end flex p-5">
              <Tooltip title={showDataset ? "Hide" : "Show Dataset Explorer"}>
                <Button
                  size="small"
                  shape="square"
                  type="default"
                  className="shadow-sm"
                  onClick={() => setShowDataset((prev) => !prev)}
                  icon={
                    showDataset ? <EyeInvisibleOutlined /> : <EyeOutlined />
                  }
                />
              </Tooltip>
            </div>
          )}

          <div
            className={
              showDataset
                ? "w-full h-full flex flex-col"
                : "w-0 h-full overflow-hidden"
            }
          >
            {showDataset && (
              <div className="w-full h-full">
                <div className="flex justify-between items-center px-4 ">
                  <div className=" py-3 ">
                    <h3 className="text-sm font-semibold text-gray-800">
                      Dataset Explorer
                    </h3>
                    <p className="text-xs text-gray-500">
                      Preview stored audio locations
                    </p>
                  </div>
                  <Tooltip title={showDataset ? "Hide" : "Expand"}>
                    <Button
                      size="small"
                      shape="square"
                      type="default"
                      className="shadow-sm"
                      onClick={() => setShowDataset((prev) => !prev)}
                      icon={
                        showDataset ? <EyeInvisibleOutlined /> : <EyeOutlined />
                      }
                    />
                  </Tooltip>
                </div>

                <DatasetFolderStructure
                  onChangeSpecies={handleChangeSpecies}
                  selectedSpecies={selectedBags}
                  dataFolder={dataFolder}
                />
              </div>
            )}
          </div>
        </aside>
        <Card className="w-[60%] rounded-xl shadow-sm relative">
          {!modelTrained ? (
            <>
              {/* Skeleton Layout */}
              <div className="blur-[2px]">
                <div className="mb-2 w-full flex justify-center">
                  <Skeleton.Input style={{ width: 200, height: 28 }} />
                </div>
                <Skeleton.Input
                  style={{ width: 150, height: 20 }}
                  className="mb-2"
                />

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
                        <Skeleton.Button
                          style={{ width: "50%", height: 100 }}
                        />
                        <Skeleton.Button
                          style={{ width: "50%", height: 100 }}
                        />
                      </div>
                      <Skeleton.Input
                        style={{ width: "100%", height: 40 }}
                        className="mt-5"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Overlay */}
              <div className="absolute inset-0 bg-white/40 flex items-center justify-center z-10 rounded-xl">
                <div className="bg-white shadow-lg rounded-lg p-6 w-[20vw] text-center border border-gray-200">
                  <div>
                    <div className="mb-3">
                      <PlayCircleOutlined className="text-4xl text-gray-400" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-800 mb-2">
                      Start Model Training
                    </h4>
                    <p className="text-sm text-gray-600">
                      Start the model training to view results and begin
                      reviewing audio snippets.
                    </p>
                  </div>
                  {/* <div>
                    <Spin />
                  </div> */}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Actual Content */}
              <div>
                <div className="mb-2 w-full flex justify-center">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedBags || "No species selected"}
                  </h2>
                </div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  Audio snippet review
                </h4>
                <div className="">
                  <AudioPredictionHistogram />
                </div>
                <div className="flex h-full gap-10 ">
                  <div className="relative flex items-center justify-center gap-4 w-[65%]">
                    <Tooltip title="Previous snippet">
                      <Button icon={<LeftOutlined />} />
                    </Tooltip>

                    {currentSnippetAudio && (
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

                    <Tooltip title="Next snippet">
                      <Button icon={<RightOutlined />} />
                    </Tooltip>
                  </div>

                  {/* Model Retraining and Feedback */}
                  <div className=" h-inherit w-[32%]">
                    <div className="w-full flex h-full flex-col justify-center items-center ">
                      {/* Accept / Reject */}
                      <div className="flex gap-3 mt-5 w-full ">
                        <Button
                          danger
                          className=" w-[50%]! h-[100px]!"
                          onClick={() => handleResponse("reject")}
                        >
                          x
                        </Button>
                        <Button
                          type="primary"
                          className=" flex-1 w-[50%]! h-[100px]! border"
                          onClick={() => handleResponse("accept")}
                        >
                          ✓
                        </Button>
                      </div>

                      {/* Retraining */}
                      {!modelTraining ? (
                        <div className="mt-5">
                          <p className="text-[11px] text-gray-500 text-center mt-2">
                            Next model retrain after{" "}
                            <span className="font-bold">{remaining}</span>{" "}
                            responses.
                            <br />{" "}
                            <a
                              className="font-medium"
                              onClick={() => handleRetrainClick()}
                            >
                              retrain now?
                            </a>
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
            </>
          )}
        </Card>

        <aside
          className={`${showTraining ? "w-[20%]" : "w-fit"} h-inherit border-r border-[#F0F0F0] bg-white flex flex-col`}
        >
          {/* Toggle button */}
          {!showTraining && (
            <div className="justify-end flex p-5">
              <Tooltip title={showTraining ? "Hide" : "Show Dataset Explorer"}>
                <Button
                  size="small"
                  shape="square"
                  type="default"
                  className="shadow-sm"
                  onClick={() => setShowTraining((prev) => !prev)}
                  icon={
                    showTraining ? <EyeInvisibleOutlined /> : <EyeOutlined />
                  }
                />
              </Tooltip>
            </div>
          )}

          <div
            className={
              showTraining
                ? "w-full h-full flex flex-col"
                : "w-0 h-full overflow-hidden"
            }
          >
            {showTraining && (
              <div className="w-full h-full relative">
                <div className="flex justify-between items-center px-4">
                  <div className="px-4 py-3 border-b">
                    <h3 className="text-sm font-semibold text-gray-800">
                      Weakly Supervised Sound Event Detection
                    </h3>
                    <p className="text-xs text-gray-500">
                      Configure and start model training
                    </p>
                  </div>
                  <Tooltip title={showTraining ? "Hide" : "Expand"}>
                    <Button
                      size="small"
                      shape="square"
                      type="default"
                      className="shadow-sm"
                      onClick={() => setShowTraining((prev) => !prev)}
                      icon={
                        showTraining ? (
                          <EyeInvisibleOutlined />
                        ) : (
                          <EyeOutlined />
                        )
                      }
                    />
                  </Tooltip>
                </div>

                {/* Content with conditional blur */}
                <div className={enableWSL ? "" : "blur-sm"}>
                  <WSLModelTraining trainingHandler={trainingHandler} />
                </div>

                {/* Disabled Overlay */}
                {enableWSL === false && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[4px] flex items-center justify-center z-10">
                    <div className="bg-white shadow-lg rounded-lg p-8 max-w-md text-center border border-gray-200 m-8">
                      <div className="mb-4">
                        <LockOutlined className="text-4xl text-gray-400" />
                      </div>
                      <h4 className="text-sm font-medium text-gray-800 mb-2">
                        Weakly Supervised Learning
                      </h4>
                      <p className="text-[12px] text-gray-500">
                        Please upload <strong>at least 2 folders</strong> to the
                        dataset panel to start training the model.
                      </p>
                      {/* <div className="mt-4 text-xs text-gray-400">
          Currently: {uploadedFolderCount} folder{uploadedFolderCount !== 1 ? 's' : ''} uploaded
        </div> */}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
