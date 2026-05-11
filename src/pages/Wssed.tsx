import { NavigationBar } from "../components/NavigationBar";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { Button, Tooltip, message } from "antd";

import { useEffect, useState } from "react";
import { useAppSelector } from "../hooks";
import { DatasetFolderStructure } from "../components/DatasetFolderStructure";
import { WSLModelTraining } from "../components/WSLModelTraining";
import { WssedAudio } from "../components/wssedAudio";

export const Wssed = () => {
  const { datasetDirectories } = useAppSelector((state) => state.dataset);
  const [showDataset, setShowDataset] = useState(true);
  const [showTraining, setShowTraining] = useState(true);
  const [remaining, setRemaining] = useState(5);
  const [enableWSL, setEnableWSL] = useState(false);
  const [modelTraining, setModelTraining] = useState(false);
  const [modelTrained, setIsModelTrained] = useState(false);

  const handleRetrainClick = () => {
    setModelTraining(true);
  };

  const stopTraining = () => {
    setModelTraining(false);
    setIsModelTrained(true);
    setRemaining(5);
    message.success("Model Successfully Trained!");
  };

  useEffect(() => {
    if (datasetDirectories) {
      setEnableWSL(true);
    }
  }, [datasetDirectories]);

  return (
    <div>
      <NavigationBar />

      <div className="py-10  flex justify-center w-full bg-gray-50 ">
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
                    <h3 className="text-sm font-ibm-mono font-semibold text-gray-800">
                      Dataset Explorer
                    </h3>
                    <p className="text-xs text-gray-500 font-ibm-sans">
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

                <DatasetFolderStructure />
              </div>
            )}
          </div>
        </aside>
        <WssedAudio
          modelTrained={modelTrained}
          modelTraining={modelTraining}
          remaining={remaining}
          handleRetrainClick={handleRetrainClick}
        />
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
                  <WSLModelTraining stopTraining={stopTraining} />
                </div>

                {/* Disabled Overlay */}
                {enableWSL === false && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-xs flex items-center justify-center z-10">
                    <div className="bg-white shadow-lg rounded-lg p-8 max-w-md text-center border border-gray-200 m-8">
                      <div className="mb-4">
                        <LockOutlined className="text-4xl text-gray-400" />
                      </div>
                      <h4 className="text-sm font-medium text-gray-800 mb-2">
                        Weakly Supervised Learning
                      </h4>
                      <p className="text-[12px] text-gray-500">
                        Please upload or select a dataset panel to start
                        training the model.
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
