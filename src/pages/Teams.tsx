import { useEffect, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  fetchAllDatasets,
  fetchAllTeamDatasets,
} from "../redux/features/datasetSlice";
import { CopyOutlined } from "@ant-design/icons";
import {
  Space,
  Table,
  Card,
  Modal,
  Button,
  Input,
  Select,
  Tooltip,
  message,
} from "antd";
import type { TableProps } from "antd";
import {
  fetchAllteams,
  createTeam,
  resetCreateTeam,
  createInvitationLink,
} from "../redux/features/teamSlice";
import { InviteTeamModal } from "../components/InviteTeamModal";

export const Teams = () => {
  const dispatch = useAppDispatch();
  const baseUrl = window.location.origin;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const { allTeams, teamCreated, invitation } = useAppSelector(
    (state) => state.team,
  );
  const { user } = useAppSelector((state: any) => state.auth);
  const { allDatasets } = useAppSelector((state) => state.dataset);

  const [teamInfo, setTeamInfo] = useState<{
    name: string;
    description: string;
    dataset_ids: string[];
  }>({
    name: "",
    description: "",
    dataset_ids: [],
  });
  interface DataType {
    id: string;
    name: string;
  }

  useEffect(() => {
    if (user && user.role === "team_owner") {
      dispatch(fetchAllTeamDatasets());
    } else {
      dispatch(fetchAllDatasets());
    }
  }, []);

  const onValueChange = (name: string, value: any) => {
    setTeamInfo((prev) => {
      const updated = { ...prev, [name]: value };
      return updated;
    });
  };

  const handleChangeDataset = (value: string) => {
    setTeamInfo((prev: any) => ({
      ...prev,
      dataset_ids: value,
    }));
  };

  const createNewTeam = () => {
    dispatch(
      createTeam({
        name: teamInfo.name,
        description: teamInfo.description,
        dataset_ids: teamInfo.dataset_ids,
      }),
    );
  };

  const columns: TableProps<DataType>["columns"] = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text) => <a>{text}</a>,
    },

    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space size="middle">
          <a
            onClick={() => {
              setSelectedTeamId(record.id);
              setIsDatasetModalOpen(true);
            }}
          >
            Invite People
          </a>
        </Space>
      ),
    },
  ];

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  const handleDatasetCancel = () => {
    setIsDatasetModalOpen(false);
  };

  const createTeamMemberInvitationLink = () => {
    dispatch(
      createInvitationLink({
        teamId: selectedTeamId,
        target_role: "user",
      }),
    );
  };

  useEffect(() => {
    dispatch(fetchAllteams());
    if (teamCreated) {
      setIsModalOpen(false);
      message.success("Team Created", undefined, () =>
        dispatch(resetCreateTeam()),
      );
    }
  }, [teamCreated]);

  useEffect(() => {}, [allTeams, invitation]);

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[60%]">
          <div className="my-6">
            <h1 className="text-2xl font-bold font-ibm-mono">Teams</h1>
            <Modal
              width={600}
              centered
              title="Create Team"
              closable={{ "aria-label": "Custom Close Button" }}
              open={isDatasetModalOpen}
              onOk={createTeamMemberInvitationLink}
              // loading={invitationLoading}
              okText="Create Invitation Link"
              onCancel={handleDatasetCancel}
              // footer={invitationCreated ? null : undefined}
            >
              <p className="text-base font-ibm-sans  my-3 mb-6">
                Pressing the button will create an invitation link that can be
                send to your colleagues to register.
              </p>

              {invitation && invitation.token && (
                <Space>
                  <a
                    href={`${import.meta.env.VITE_YAPAT_FRONTEND_URL}/?token=${invitation.token}&&target_role=${invitation.target_role}`}
                    target="_blank"
                  >
                    Invitation Link
                  </a>

                  <Tooltip title="Copy link">
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${import.meta.env.VITE_YAPAT_FRONTEND_URL}/?token=${invitation.token}&&target_role=${invitation.target_role}`,
                        );
                        message.success("Invitation link copied!");
                      }}
                    />
                  </Tooltip>
                </Space>
              )}
              <p></p>
            </Modal>

            <Modal
              centered
              title="Create Team"
              closable={{ "aria-label": "Custom Close Button" }}
              open={isModalOpen}
              onOk={createNewTeam}
              okText="Create Team"
              onCancel={handleCancel}
              okButtonProps={{
                disabled: !teamInfo.name?.trim(),
              }}
            >
              <>
                <div>
                  <p className="font-ibm-sans input_heading_text">
                    Team Name <span style={{ color: "red" }}>*</span>
                  </p>

                  <Input
                    style={{
                      height: "fit-content",
                      flex: 1,
                      fontFamily: "IBM Plex Sans, sans-serif",
                      margin: "0px 0px 10px 0px",
                      padding: "10px",
                      backgroundColor: "#F7FBFF",
                      color: "#8897AD",
                    }}
                    name="name"
                    id="name"
                    type="text"
                    value={teamInfo.name}
                    placeholder="Enter Team Name"
                    onChange={(e) =>
                      onValueChange(e.target.name, e.target.value)
                    }
                  />
                </div>

                <div>
                  <p className="font-ibm-sans input_heading_text">
                    Description
                  </p>

                  <Input
                    style={{
                      height: "fit-content",
                      flex: 1,
                      fontFamily: "IBM Plex Sans, sans-serif",
                      margin: "0px 0px 10px 0px",
                      padding: "10px",
                      backgroundColor: "#F7FBFF",
                      color: "#8897AD",
                    }}
                    name="description"
                    id="description"
                    type="text"
                    value={teamInfo.description}
                    placeholder="Enter Description"
                    onChange={(e) =>
                      onValueChange(e.target.name, e.target.value)
                    }
                  />
                </div>

                {allDatasets && allDatasets.length > 0 && (
                  <div>
                    <p className="font-ibm-sans input_heading_text">
                      Choose Dataset
                    </p>

                    <Select<string>
                      mode="multiple" // multiple selection
                      value={teamInfo.dataset_ids} // bind to string[]
                      style={{
                        width: "100%",
                        height: "fit-content",
                        flex: 1,
                        fontFamily: "IBM Plex Sans, sans-serif",
                        margin: "0px 0px 10px 0px",
                        padding: "10px",
                        backgroundColor: "#F7FBFF",
                        color: "#8897AD",
                      }}
                      onChange={handleChangeDataset} // value: string[]
                      options={allDatasets.map((dataset) => ({
                        value: dataset.id,
                        label: dataset.name,
                      }))}
                      placeholder="Select one or more datasets"
                    />
                  </div>
                )}
              </>
            </Modal>

            <p className="sub_description_text">
              Below you can view/ edit all teams
            </p>
          </div>
          <Card variant="borderless">
            <div className="flex justify-between items-center">
              <h1 className="card_heading_text">All Teams</h1>
              {/* <InviteTeamModal /> */}
              {/* {user && user.role === "team_owner" && ( */}

              {/* Allow admin to create team */}
              <Button type="primary" onClick={showModal}>
                Create Team
              </Button>
              {/* )} */}
            </div>
            {allTeams && allTeams.length > 0 ? (
              <Table<DataType> columns={columns} dataSource={allTeams} />
            ) : (
              <div>
                <p> No teams to display</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
