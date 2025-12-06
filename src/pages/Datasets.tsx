import React, { useEffect, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import {
  createInvitation,
  resetInvitationState,
} from "../redux/features/invitationSlice";

import {
  Flex,
  List,
  Space,
  Table,
  Tag,
  Card,
  Radio,
  Modal,
  Button,
  Checkbox,
} from "antd";
import type { CheckboxProps } from "antd";
import type { TableProps } from "antd";

export const Datasets = () => {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAppSelector((state: any) => state.auth);
  const { invitationLoading, invitationCreated, invitationLinkToken } =
    useAppSelector((state: any) => state.invitation);
    const {}
  const { allDatasets }: { allDatasets: DataType[] } = useAppSelector(
    (state) => state.dataset
  );
  interface DataType {
    id: string;
    name: string;
  }

  const showModal = () => {
    setIsModalOpen(true);
  };

  const createInvitationLink = () => {
    // setIsModalOpen(false);
    dispatch(
      createInvitation({
        dataset_ids: checkedList,
      })
    );
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

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

  const radioStyle = {
    display: "flex",
    width: "100%",
    flexDirection: "column",
    gap: 25,
    paddingTop: 20,
  };

  const plainOptions = ["Apple", "Pear", "Orange"];
  const defaultCheckedList = ["Apple", "Orange"];
  const CheckboxGroup = Checkbox.Group;

  const [checkedList, setCheckedList] = useState<string[]>(defaultCheckedList);

  const checkAll = plainOptions.length === checkedList.length;
  const indeterminate =
    checkedList.length > 0 && checkedList.length < plainOptions.length;

  const onChange = (list: string[]) => {
    console.log("changed list", list);
    setCheckedList(list);
  };

  const onCheckAllChange: CheckboxProps["onChange"] = (e) => {
    setCheckedList(e.target.checked ? plainOptions : []);
  };

  useEffect(() => {
    dispatch(fetchAllDatasets());
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
                  {user && user.role === "admin" && (
                    <Button type="primary" onClick={showModal}>
                      Invite Teams
                    </Button>
                  )}
                </div>
                <Modal
                  centered
                  title="Invite Teams"
                  closable={{ "aria-label": "Custom Close Button" }}
                  open={isModalOpen}
                  onOk={createInvitationLink}
                  loading={invitationLoading}
                  okText="Create Invitation Link"
                  onCancel={handleCancel}
                  footer={invitationCreated ? null : undefined}
                >
                  {invitationCreated ? (
                    <>
                      <p>Invitation link created successfully</p>
                      <a
                        href={`${
                          import.meta.env.VITE_YAPAT_FRONTEND_URL
                        }?invitation_token=${invitationLinkToken}`}
                      >
                        Invitation Link
                      </a>
                    </>
                  ) : (
                    <>
                      {/* <Checkbox
                      indeterminate={indeterminate}
                      onChange={onCheckAllChange}
                      checked={checkAll}
                    >
                      Check all
                    </Checkbox> */}
                      <CheckboxGroup
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                        value={checkedList}
                        onChange={onChange}
                      >
                        {allDatasets.map((item) => (
                          <div
                            key={item.id}
                            style={{ display: "block", padding: "4px 0" }}
                          >
                            <Checkbox value={item.id}>
                              <p>{item.name}</p>
                            </Checkbox>
                          </div>
                        ))}
                      </CheckboxGroup>
                    </>
                  )}
                </Modal>
                <div className="flex flex-col gap-3">
                  {allDatasets.map((dataset, index) => (
                    <div>
                      <div className="pl-5 flex items-start justify-between ">
                        <div>
                          <h2 className="sub_head_text">{dataset.name}</h2>
                          {/* <p className="sub_base_text">{dataset.subText}</p> */}
                          <p className="sub_base_text">Some description</p>
                        </div>
                      </div>
                    </div>
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
