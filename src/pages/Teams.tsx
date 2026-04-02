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
  resetTeamDeleted,
} from "../redux/features/teamSlice";

export const Teams = () => {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamIsReady, setSelectedTeamIsReady] = useState(false);
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const { allTeams, teamCreated, teamDeleted, invitation, error } =
    useAppSelector((state) => state.team);
  const { user } = useAppSelector((state: any) => state.auth);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const baseUrl =
    import.meta.env.VITE_YAPAT_FRONTEND_URL || window.location.origin;
  const isInvitingTeamMembers =
    (invitation?.target_role || (selectedTeamIsReady ? "user" : "owner")) ===
    "user";

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
    is_ready: boolean;
    datasets?: {
      id: number;
      name: string;
    }[];
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

  const handleChangeDataset = (value: string[]) => {
    setTeamInfo((prev: any) => ({
      ...prev,
      dataset_ids: [value],
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
      title: "Dataset",
      key: "dataset",
      render: (_, record) => {
        const datasetNames =
          record.datasets?.map((d) => d.name).join(", ") || "—";

        return <span>{datasetNames}</span>;
      },
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space size="middle">
          <a
            onClick={() => {
              setSelectedTeamId(record.id);
              setSelectedTeamIsReady(record.is_ready);
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
        target_role: selectedTeamIsReady ? "user" : "owner",
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

  useEffect(() => {
    if (teamDeleted) {
      message.success("Team deleted successfully");
      dispatch(resetTeamDeleted());
    }
    if (error) {
      message.error(
        typeof error === "string" ? error : "Failed to delete team",
      );
      dispatch(resetTeamDeleted());
    }
  }, [teamDeleted, error]);

  useEffect(() => {}, [allTeams, invitation]);

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[85%]">
          <div className="my-6">
            <h1 className="text-2xl font-bold font-ibm-mono">Teams</h1>
            <Modal
              width={600}
              centered
              title="Create Team"
              closable={{ "aria-label": "Custom Close Button" }}
              open={isDatasetModalOpen}
              onOk={createTeamMemberInvitationLink}
              okText="Create Invitation Link"
              onCancel={handleDatasetCancel}
            >
              {invitation && invitation.token ? (
                isInvitingTeamMembers ? (
                  <p className="text-base font-ibm-sans my-3 mb-6">
                    Invitation link created for <strong>team members</strong>.
                    Share this link with users who should join the team.
                  </p>
                ) : (
                  <p className="text-base font-ibm-sans my-3 mb-6">
                    Invitation link created for a <strong>team owner</strong>.
                    Share this link so the owner can register and take ownership
                    of the team.
                  </p>
                )
              ) : isInvitingTeamMembers ? (
                <p className="text-base font-ibm-sans my-3 mb-6">
                  This team already has an owner. Pressing the button will
                  create an invitation link for a{" "}
                  <strong>team member (user)</strong> to join the team.
                </p>
              ) : (
                <p className="text-base font-ibm-sans my-3 mb-6">
                  This team has no owner yet. Pressing the button will create an
                  invitation link for a <strong>team owner</strong> to register
                  and take ownership of the team.
                </p>
              )}

              {invitation && invitation.token && (
                <Space>
                  <a
                    href={`${baseUrl}/login/?token=${invitation.token}&target_role=${invitation.target_role}`}
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
                          `${baseUrl}/login/?token=${invitation.token}&target_role=${invitation.target_role}`,
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
                disabled:
                  !teamInfo.name?.trim() || !teamInfo.dataset_ids?.length,
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

                    <Select<string[]>
                      value={teamInfo.dataset_ids}
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
                      onChange={handleChangeDataset}
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
              <Button type="primary" onClick={showModal}>
                Create Team
              </Button>
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
