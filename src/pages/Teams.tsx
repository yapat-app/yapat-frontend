import { useEffect, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { Space, Table, Card, Modal, Button, Input, Select } from "antd";
import type { TableProps } from "antd";
import { fetchAllteams, createTeam } from "../redux/features/teamSlice";
import { InviteTeamModal } from "../components/InviteTeamModal";

export const Teams = () => {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const { allTeams, teamCreated } = useAppSelector((state) => state.team);
  const { user } = useAppSelector((state: any) => state.auth);
  const { allDatasets }: { allDatasets: DataType[] } = useAppSelector(
    (state) => state.dataset,
  );
  const [teamInfo, setTeamInfo] = useState<{
    name: string;
    description: string;
    dataset_id: string | null;
  }>({
    name: "",
    description: "",
    dataset_id: null,
  });
  interface DataType {
    id: string;
    name: string;
  }

  useEffect(() => {
    dispatch(fetchAllDatasets());
  }, []);

  const onValueChange = (name: string, value: any) => {
    setTeamInfo((prev) => {
      const updated = { ...prev, [name]: value };
      return updated;
    });
  };

  const handleChangeDataset = (value: string) => {
    setTeamInfo((prev: any) => {
      const updated = { ...prev, ["dataset_id"]: value };
      return updated;
    });
  };

  const createNewTeam = () => {
    console.log(teamInfo);
    dispatch(
      createTeam({
        name: teamInfo.name,
        description: teamInfo.description,
      }),
    );
  };

  useEffect(() => {
    if (teamCreated) {
      setIsModalOpen(false);
    }
  }, [teamCreated]);

  // const { allDatasets }: { allDatasets: DataType[] } = useAppSelector(
  //   (state) => state.dataset
  // );

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
      render: (_) => (
        <Space size="middle">
          <a onClick={() => setIsDatasetModalOpen(true)}>Dataset Access</a>
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

  useEffect(() => {
    dispatch(fetchAllteams());
  }, [teamCreated]);

  useEffect(() => {}, [allTeams]);

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[60%]">
          <div className="my-6">
            <h1 className="text-2xl font-bold font-ibm-mono">Teams</h1>
            <Modal
              centered
              title="Create Team"
              closable={{ "aria-label": "Custom Close Button" }}
              open={isDatasetModalOpen}
              // onOk={createTeamMemberInvitationLink}
              // loading={invitationLoading}
              okText="Create Invitation Link"
              onCancel={handleDatasetCancel}
              // footer={invitationCreated ? null : undefined}
            >
              <>
                {allDatasets && allDatasets.length > 0 && (
                  <div>
                    <p className=" font-ibm-sans input_heading_text">
                      Choose Dataset
                    </p>

                    <Select
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
                      defaultValue=""
                      // style={{ width: 120 }}
                      onChange={handleChangeDataset}
                      options={allDatasets.map((dataset) => ({
                        value: dataset.id,
                        label: dataset.name,
                      }))}
                    />
                  </div>
                )}
              </>
            </Modal>

            <Modal
              centered
              title="Create Team"
              closable={{ "aria-label": "Custom Close Button" }}
              open={isModalOpen}
              onOk={createNewTeam}
              // loading={invitationLoading}
              okText="Create Team"
              onCancel={handleCancel}
              // footer={invitationCreated ? null : undefined}
            >
              <>
                <div>
                  <p className=" font-ibm-sans input_heading_text">Team Name</p>
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
                    placeholder={"Enter Team Name"}
                    onChange={(e) =>
                      onValueChange(e.target.name, e.target.value)
                    }
                  />
                </div>
                <div>
                  <p className=" font-ibm-sans input_heading_text">
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
                    placeholder={"Enter Description"}
                    onChange={(e) =>
                      onValueChange(e.target.name, e.target.value)
                    }
                  />
                </div>
              </>
            </Modal>
            <p className="sub_description_text">
              Below you can view/ edit all teams
            </p>
          </div>
          <Card variant="borderless">
            <div className="flex justify-between items-center">
              <h1 className="card_heading_text">All Teams</h1>
              <InviteTeamModal />
              {user && user.role === "team_owner" && (
                <Button type="primary" onClick={showModal}>
                  Create Team
                </Button>
              )}
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
