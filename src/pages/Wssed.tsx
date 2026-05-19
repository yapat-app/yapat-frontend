import { NavigationBar } from "../components/NavigationBar";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { Button, Tooltip, message } from "antd";

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { DatasetFolderStructure } from "../components/DatasetFolderStructure";
import { WSLModelTraining } from "../components/WSLModelTraining";
import { WssedActiveLearningHub } from "../components/WssedActiveLearningHub";
import { setTraining } from "../redux/features/wssedSlice";
import { wssedApi } from "../services/api";

export const Wssed = () => {
  const dispatch = useAppDispatch();
  const { datasetDirectories } = useAppSelector((state) => state.dataset);
  const modelTraining = useAppSelector((state) => state.wssed.modelTraining);

  const [showDataset, setShowDataset] = useState(true);
  const [showTraining, setShowTraining] = useState(true);
  const [enableWSL, setEnableWSL] = useState(false);
  const [modelTrained, setIsModelTrained] = useState(false);

  const datasetId = datasetDirectories?.dataset_id
    ? Number(datasetDirectories.dataset_id)
    : null;

  const stopTraining = useCallback(() => {
    dispatch(setTraining(false));
    setIsModelTrained(true);
    message.success("Model training completed.");
  }, [dispatch]);

  useEffect(() => {
    if (!datasetId) {
      setIsModelTrained(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const status = await wssedApi.getLatestTrainingJobStatus(datasetId);
        if (cancelled) return;

        if (status.status === "COMPLETED") {
          setIsModelTrained(true);
          dispatch(setTraining(false));
        } else if (status.status === "TRAINING") {
          setIsModelTrained(false);
          dispatch(setTraining(true));
        } else if (status.status === "FAILED") {
          setIsModelTrained(false);
          dispatch(setTraining(false));
        } else {
          setIsModelTrained(false);
        }
      } catch {
        if (!cancelled) {
          setIsModelTrained(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [datasetId, dispatch]);

  useEffect(() => {
    if (datasetDirectories) {
      setEnableWSL(true);
    }
  }, [datasetDirectories]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <NavigationBar />

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            showDataset ? "w-[18%] min-w-[220px]" : "w-fit"
          } flex min-h-0 shrink-0 flex-col border-r border-[#F0F0F0] bg-white`}
        >
          {!showDataset && (
            <div className="flex justify-end p-3">
              <Tooltip title="Show Dataset Explorer">
                <Button
                  size="small"
                  shape="square"
                  type="default"
                  className="shadow-sm"
                  onClick={() => setShowDataset(true)}
                  icon={<EyeOutlined />}
                />
              </Tooltip>
            </div>
          )}

          {showDataset && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between px-4 py-3">
                <div>
                  <h3 className="text-sm font-ibm-mono font-semibold text-gray-800">
                    Dataset Explorer
                  </h3>
                  <p className="text-xs text-gray-500 font-ibm-sans">
                    Preview stored audio locations
                  </p>
                </div>
                <Tooltip title="Hide Dataset Explorer">
                  <Button
                    size="small"
                    shape="square"
                    type="default"
                    className="shadow-sm"
                    onClick={() => setShowDataset(false)}
                    icon={<EyeInvisibleOutlined />}
                  />
                </Tooltip>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <DatasetFolderStructure />
              </div>
            </div>
          )}
        </aside>

        <WssedActiveLearningHub
          modelTrained={modelTrained}
          modelTraining={modelTraining}
          datasetId={datasetId}
        />

        <aside
          className={`${
            showTraining ? "w-[22%] min-w-[280px]" : "w-fit"
          } flex min-h-0 shrink-0 flex-col border-l border-[#F0F0F0] bg-white`}
        >
          {!showTraining && (
            <div className="flex justify-end p-3">
              <Tooltip title="Show training panel">
                <Button
                  size="small"
                  shape="square"
                  type="default"
                  className="shadow-sm"
                  onClick={() => setShowTraining(true)}
                  icon={<EyeOutlined />}
                />
              </Tooltip>
            </div>
          )}

          {showTraining && (
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">
                    Weakly Supervised Sound Event Detection
                  </h3>
                  <p className="text-xs text-gray-500">
                    Configure and start model training
                  </p>
                </div>
                <Tooltip title="Hide training panel">
                  <Button
                    size="small"
                    shape="square"
                    type="default"
                    className="shadow-sm"
                    onClick={() => setShowTraining(false)}
                    icon={<EyeInvisibleOutlined />}
                  />
                </Tooltip>
              </div>

              <div
                className={`min-h-0 flex-1 overflow-hidden ${
                  enableWSL ? "" : "blur-sm"
                }`}
              >
                <WSLModelTraining
                  datasetId={datasetId}
                  stopTraining={stopTraining}
                />
              </div>

              {enableWSL === false && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-xs">
                  <div className="m-6 max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-lg">
                    <div className="mb-4">
                      <LockOutlined className="text-4xl text-gray-400" />
                    </div>
                    <h4 className="mb-2 text-sm font-medium text-gray-800">
                      Weakly Supervised Learning
                    </h4>
                    <p className="text-[12px] text-gray-500">
                      Please upload or select a dataset panel to start training
                      the model.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
