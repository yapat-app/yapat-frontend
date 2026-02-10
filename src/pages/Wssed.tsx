import { NavigationBar } from "../components/NavigationBar";
import Card from "antd/es/card/Card";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import Plot from "react-plotly.js";
import type { Layout, Data } from "plotly.js";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import {
  Select,
  Modal,
  Button,
  Form,
  Input,
  Tooltip,
  Progress,
  Tag,
} from "antd";
import type { SelectProps } from "antd/es/select";
import { useState } from "react";
import { useAppDispatch } from "../hooks";
import { useAppSelector } from "../hooks";
import { DatasetFolderStructure } from "../components/DatasetFolderStructure";

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

type SpeciesPrediction = {
  species: string;
  avgConfidence: number; // 0–1
  predictionCount: number;
};

const AudioPredictionHistogram: React.FC = () => {
  // Static sample model output
  const speciesPredictions: SpeciesPrediction[] = [
    {
      species: "Corvus corax",
      avgConfidence: 0.82,
      predictionCount: 18,
    },
    {
      species: "Passer domesticus",
      avgConfidence: 0.67,
      predictionCount: 14,
    },
    {
      species: "Turdus merula",
      avgConfidence: 0.74,
      predictionCount: 12,
    },
    {
      species: "Environmental Noise",
      avgConfidence: 0.41,
      predictionCount: 20,
    },
    {
      species: "Unknown / Other",
      avgConfidence: 0.29,
      predictionCount: 14,
    },
  ];

  const plotData: Data[] = [
    {
      type: "bar",
      x: speciesPredictions.map((s) => s.species),
      y: speciesPredictions.map((s) => s.avgConfidence),
      //   text: speciesPredictions.map((s) => `${s.predictionCount} predictions`),
      hovertemplate:
        "<b>%{x}</b><br>" +
        "Avg confidence: %{y:.2f}<br>" +
        "%{text}<extra></extra>",
      marker: {
        color: speciesPredictions.map((s) =>
          s.avgConfidence >= 0.7
            ? "#22c55e"
            : s.avgConfidence >= 0.4
              ? "#facc15"
              : "#ef4444",
        ),
      },
    },
  ];

  const layout: Partial<Layout> = {
    title: {
      text: "Model Prediction Confidence per Species",
      font: { size: 16 },
    },
    xaxis: {
      title: "Species",
    },
    yaxis: {
      title: "Confidence (0–1)",
      range: [0, 1],
      tickformat: ".1f",
    },
    bargap: 0.35,
    height: 260,
    margin: { t: 50, l: 60, r: 30, b: 90 },
  };

  return (
    <div className="w-full py-4">
      <Plot
        data={plotData}
        layout={layout}
        config={{ displayModeBar: false }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export const Wssed = () => {
  const dispatch = useAppDispatch();
  const [selectedBags, setSelectedBags] = useState<string>("birds_europe");
  const { currentSnippetAudio } = useAppSelector((state: any) => state.snippet);
  const [remaining, setRemaining] = useState(5);

  const handleChange = (value: string) => {
    setSelectedBags(value as string);
  };

  const handleResponse = (action: "accept" | "reject") => {
    if (remaining === 0) return;
    setRemaining((prev) => Math.max(prev - 1, 0));
  };

  const handleRetrain = () => {
    console.log("Manual retrain triggered");
  };

  return (
    <div>
      <NavigationBar />

      <div className="py-10 flex justify-center w-full bg-gray-50 ">
        <DatasetFolderStructure />
        <Card className="w-[80%] rounded-xl shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Audio Model Review
            </h2>
          </div>

          <Card size="small" className="mb-6 bg-gray-50">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-medium text-gray-800">
                  Species selection
                </h4>
                <p className="text-xs text-gray-500">
                  Choose the species group to review predictions
                </p>
              </div>

              <div className="w-[320px]">
                <Select
                  value={selectedBags}
                  placeholder="Select species bags"
                  onChange={handleChange}
                  maxTagCount="responsive"
                  options={speciesBags}
                  className="w-full"
                  optionFilterProp="label"
                />
              </div>
            </div>
          </Card>

          <Card className="mb-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-4">
              Audio snippet review
            </h4>
            <div className="mb-2">
              <AudioPredictionHistogram />
            </div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  Predicted species
                </h4>
                <p className="text-xs italic text-gray-500">Corvus corax</p>
              </div>

              <Tag color="green">Bird</Tag>
            </div>
            <div className="relative flex items-center justify-center gap-4">
              <Tooltip title="Previous snippet">
                <Button icon={<LeftOutlined />} />
              </Tooltip>

              {currentSnippetAudio && (
                <SpectrogramPlayer
                  key={currentSnippetAudio}
                  src={currentSnippetAudio}
                  sampleRate={16000}
                  specHeight={360}
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
          </Card>

          {/* Accept / Reject */}
          <div className="flex gap-3 mt-5 w-full ">
            <Button
              danger
              className=" w-[50%]!"
              // disabled={remaining === 0}
              onClick={() => handleResponse("reject")}
            >
              x
            </Button>
            <Button
              type="primary"
              className="bg-green-600! hover:bg-green-700! flex-1 w-[50%]! border border-green-300!"
              // disabled={remaining === 0}
              onClick={() => handleResponse("accept")}
            >
              ✓
            </Button>
          </div>

          {/* Retraining */}
          <div className="mt-5">
            <Button loading={true} block onClick={handleRetrain}>
              Retrain model now
            </Button>

            <p className="text-[11px] text-gray-500 text-center mt-2">
              The model will automatically retrain after collecting{" "}
              <span className="font-medium">{remaining}</span> more responses.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
