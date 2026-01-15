import React, { useEffect, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { getAllDatasetAnnotationStats } from "../redux/features/annotationSlice";
import { Flex, Space, Modal, Button, Checkbox, message } from "antd";

import type { CheckboxProps } from "antd";
import type { TableProps } from "antd";
import { GenerateFeedModal } from "../components/GenerateFeed";
import { ExportAnnotationButton } from "../components/ExportAnnotation";
import { DatasetCard } from "../components/DatasetCard";
import { clearSnippets } from "../redux/features/snippetSlice";
import { clearEmbedding } from "../redux/features/embeddingSlice";

export const Datasets = () => {
  const dispatch = useAppDispatch();

  const { user } = useAppSelector((state: any) => state.auth);
  const { snippets } = useAppSelector((state: any) => state.snippet);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  interface DataType {
    id: string;
    name: string;
  }

  const columns: TableProps<DataType>["columns"] = [
    {
      title: "dataset Name",
      dataIndex: "name",
      key: "name",
      render: (text) => <a>{text}</a>,
    },

    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space size="middle">
          <a>Delete</a>
        </Space>
      ),
    },
  ];

  //clear embeddings and snippets flags
  useEffect(() => {
    if (snippets.length > 0) {
      dispatch(clearSnippets());
    }
  }, []);

  useEffect(() => {
    dispatch(fetchAllDatasets());
    dispatch(getAllDatasetAnnotationStats());
  }, []);

  useEffect(() => {}, [allDatasets]);

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[60%]">
          <div className="my-6">
            <h1 className="text-2xl font-bold font-ibm-mono">Datasets</h1>
            <p className="sub_description_text">
              Below you can view/ edit all datasets
            </p>
          </div>
          {allDatasets && allDatasets.length > 0 && (
            <>
              {/* <Card variant="borderless">
                <h1 className="card_heading_text">All Datasets</h1>
                <Table<DataType> columns={columns} dataSource={allDatasets} />
              </Card> */}
              <div id="dataset_list">
                <div className="flex justify-between items-center">
                  <h2 className="card_heading_text">Available Datasets</h2>
                </div>
                <div className="flex flex-col gap-3">
                  {allDatasets.map((dataset, index) => (
                    <DatasetCard key={dataset.id} dataset={dataset} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
