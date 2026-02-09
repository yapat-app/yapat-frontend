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

const AudioPredictionHistogram: React.FC = () => {
  // Static sample data
  const plotData: Data[] = [
    {
      type: "bar",
      x: ["Bird Species", "Environmental Species", "Other / Remaining"],
      y: [24, 26, 28],
      text: [
        "Corvus corax, Passer domesticus, Turdus merula, Parus major",
        "Anura spp., Cicadidae spp., Gryllidae spp.",
        "Wind, Rain, Urban noise, Unknown",
      ],
      hoverinfo: "y+text",
      marker: {
        color: ["#4ade80", "#60a5fa", "#facc15"],
      },
    },
  ];

  const layout: Partial<Layout> = {
    title: {
      text: "Model Predictions from Audio Samples (n = 78)",
      font: { size: 16 },
    },
    xaxis: {
      title: "Prediction Category",
    },
    yaxis: {
      title: "Number of Predictions",
      rangemode: "tozero",
    },
    bargap: 0.4,
    height: 200,
    margin: { t: 60, l: 60, r: 30, b: 60 },
  };

  return (
    <div className="w-full py-5">
      <Card className="h-fit ">
        <Plot
          data={plotData}
          layout={layout}
          config={{ displayModeBar: false }}
          style={{ width: "inherit", height: "100%" }}
        />
      </Card>
    </div>
  );
};

export const Wssed = () => {
  const dispatch = useAppDispatch();
  const [selectedBags, setSelectedBags] = useState<string[]>(["birds_europe"]);
  const { currentSnippetAudio } = useAppSelector((state: any) => state.snippet);
  const [remaining, setRemaining] = useState(10);

  const handleChange = (value: SelectProps["value"]) => {
    setSelectedBags(value as string[]);
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

      <div className="py-10 flex justify-center w-full bg-gray-50">
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
                  mode="multiple"
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

          <div className="mb-2">
            <h4 className="text-sm font-semibold text-gray-800 mt-2">
              Dataset overview
            </h4>
            <AudioPredictionHistogram />
          </div>

          <Card className="mb-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-4">
              Audio snippet review
            </h4>

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

          <Card>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  Predicted species
                </h4>
                <p className="text-xs italic text-gray-500">Morus (bird)</p>
              </div>

              <Tag color="green">Bird</Tag>
            </div>

            {/* Confidence */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Model confidence</span>
                <span>60%</span>
              </div>
              <Progress percent={60} showInfo={false} strokeColor="#22c55e" />
            </div>

            {/* Accept / Reject */}
            <div className="flex gap-3 mt-5">
              <Button
                type="primary"
                className="bg-green-600 hover:bg-green-700 flex-1"
                // disabled={remaining === 0}
                onClick={() => handleResponse("accept")}
              >
                Accept prediction
              </Button>

              <Button
                danger
                className="flex-1"
                // disabled={remaining === 0}
                onClick={() => handleResponse("reject")}
              >
                Reject prediction
              </Button>
            </div>

            {/* Retraining */}
            <div className="mt-5">
              <Button block onClick={handleRetrain}>
                Retrain model now
              </Button>

              <p className="text-[11px] text-gray-500 text-center mt-2">
                The model will automatically retrain after collecting{" "}
                <span className="font-medium">{remaining}</span> more responses.
              </p>
            </div>
          </Card>
        </Card>
      </div>
    </div>
  );
};
