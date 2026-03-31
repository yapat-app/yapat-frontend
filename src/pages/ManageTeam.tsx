import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  fetchTeamById,
  fetchTeamMembers,
  updateTeam,
  deleteTeam,
  removeTeamMember,
  createInvitationLink,
  resetTeamUpdated,
  resetTeamDeleted,
  clearInvitation,
} from "../redux/features/teamSlice";
import {
  Card,
  Button,
  Input,
  Modal,
  Table,
  Space,
  Tag,
  Tooltip,
  message,
  Spin,
  Popconfirm,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  UserDeleteOutlined,
  CopyOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import type { TableProps } from "antd";
import type { TeamMember } from "../types";

export const ManageTeam = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { currentTeam, teamMembers, loading, teamUpdated, teamDeleted, invitation } =
    useAppSelector((state) => state.team);
  useAppSelector((state: any) => state.auth);
  const frontendBaseUrl =
    import.meta.env.VITE_YAPAT_FRONTEND_URL || window.location.origin;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Load team and members on mount
  useEffect(() => {
    if (teamId) {
      dispatch(fetchTeamById(teamId));
      dispatch(fetchTeamMembers(teamId));
    }
  }, [teamId]);

  // Populate edit form when team loads
  useEffect(() => {
    if (currentTeam) {
      setEditForm({
        name: currentTeam.name,
        description: currentTeam.description ?? "",
      });
    }
  }, [currentTeam]);

  // Handle successful update
  useEffect(() => {
    if (teamUpdated) {
      message.success("Team details updated successfully.");
      setIsEditing(false);
      dispatch(resetTeamUpdated());
    }
  }, [teamUpdated]);

  // Handle successful delete — navigate back to teams list
  useEffect(() => {
    if (teamDeleted) {
      message.success("Team deleted.");
      dispatch(resetTeamDeleted());
      navigate("/teams");
    }
  }, [teamDeleted]);

  const handleSave = () => {
    if (!editForm.name.trim()) {
      message.error("Team name cannot be empty.");
      return;
    }
    dispatch(updateTeam({ teamId: teamId!, body: editForm }));
  };

  const handleCancelEdit = () => {
    setEditForm({
      name: currentTeam?.name ?? "",
      description: currentTeam?.description ?? "",
    });
    setIsEditing(false);
  };

  const handleDeleteTeam = () => {
    dispatch(deleteTeam(teamId!));
  };

  const handleRemoveMember = (userId: number) => {
    dispatch(removeTeamMember({ teamId: teamId!, userId }));
  };

  const handleOpenInvite = () => {
    dispatch(clearInvitation());
    setIsInviteModalOpen(true);
  };

  const handleCreateInvite = () => {
    // Team is ready means it already has an owner → invite users
    const targetRole = currentTeam?.is_ready ? "user" : "owner";
    dispatch(createInvitationLink({ teamId, target_role: targetRole }));
  };

  const invitationRole = invitation?.target_role ?? (currentTeam?.is_ready ? "user" : "owner");
  const isInvitingMembers = invitationRole === "user";

  const memberColumns: TableProps<TeamMember>["columns"] = [
    {
      title: "Name",
      key: "name",
      render: (_, record) => (
        <span>{record.full_name || record.username}</span>
      ),
    },
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "owner" ? "gold" : "blue"}>
          {role === "owner" ? "Owner" : "Member"}
        </Tag>
      ),
    },
    {
      title: "Joined",
      dataIndex: "joined_at",
      key: "joined_at",
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => {
        const isOwner = record.role === "owner";
        return (
          <Popconfirm
            title="Remove member"
            description={`Remove ${record.full_name || record.username} from the team?`}
            onConfirm={() => handleRemoveMember(record.user_id)}
            okText="Remove"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            disabled={isOwner}
          >
            <Tooltip title={isOwner ? "Owners cannot be removed" : "Remove member"}>
              <Button
                type="text"
                danger
                icon={<UserDeleteOutlined />}
                disabled={isOwner}
              />
            </Tooltip>
          </Popconfirm>
        );
      },
    },
  ];

  if (loading && !currentTeam) {
    return (
      <div>
        <NavigationBar />
        <div className="w-full flex justify-center mt-24">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  if (!currentTeam) {
    return (
      <div>
        <NavigationBar />
        <div className="w-full flex justify-center mt-24">
          <p className="text-gray-500">Team not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[85%]">
          {/* Header */}
          <div className="my-6 flex items-center gap-3">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/teams")}
            />
            <div>
              <h1 className="text-2xl font-bold font-ibm-mono">
                Manage Team
              </h1>
              <p className="sub_description_text">
                View and manage your team settings, members, and access.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6 pb-12">
            {/* ── Section 1: About the Team ── */}
            <Card
              variant="borderless"
              title={
                <span className="card_heading_text">About the Team</span>
              }
              extra={
                !isEditing ? (
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </Button>
                ) : (
                  <Space>
                    <Button
                      icon={<CloseOutlined />}
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={loading}
                      onClick={handleSave}
                    >
                      Save
                    </Button>
                  </Space>
                )
              }
            >
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-ibm-sans input_heading_text mb-1">
                    Team Name <span style={{ color: "red" }}>*</span>
                  </p>
                  {isEditing ? (
                    <Input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      style={{
                        backgroundColor: "#F7FBFF",
                        color: "#8897AD",
                        padding: "10px",
                      }}
                    />
                  ) : (
                    <p className="font-ibm-sans text-base">{currentTeam.name}</p>
                  )}
                </div>

                <div>
                  <p className="font-ibm-sans input_heading_text mb-1">
                    Description
                  </p>
                  {isEditing ? (
                    <Input.TextArea
                      rows={3}
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      style={{
                        backgroundColor: "#F7FBFF",
                        color: "#8897AD",
                        padding: "10px",
                      }}
                    />
                  ) : (
                    <p className="font-ibm-sans text-base text-gray-500">
                      {currentTeam.description || "No description provided."}
                    </p>
                  )}
                </div>

              </div>
            </Card>

            {/* ── Section 2: Team Members ── */}
            <Card
              variant="borderless"
              title={
                <span className="card_heading_text">Team Members</span>
              }
              extra={
                <Button type="primary" onClick={handleOpenInvite}>
                  {currentTeam.is_ready ? "Invite Team Members" : "Invite Team Owner"}
                </Button>
              }
            >
              {teamMembers.length > 0 ? (
                <Table<TeamMember>
                  columns={memberColumns}
                  dataSource={teamMembers}
                  rowKey="membership_id"
                  pagination={false}
                />
              ) : (
                <p className="text-gray-500">No members yet.</p>
              )}
            </Card>

            {/* ── Section 3: Delete Team ── */}
            <Card
              variant="borderless"
              style={{ borderColor: "#ffa39e" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-ibm-sans font-semibold">Delete this team</p>
                  <p className="font-ibm-sans text-gray-500 text-sm">
                    All datasets will be unassigned. Members and invitations will
                    be permanently removed. This action cannot be undone.
                  </p>
                </div>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  Delete Team
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        centered
        title="Delete Team"
        open={isDeleteModalOpen}
        onOk={handleDeleteTeam}
        okText="Yes, delete"
        okButtonProps={{ danger: true, loading }}
        onCancel={() => setIsDeleteModalOpen(false)}
        cancelText="Cancel"
      >
        <p className="font-ibm-sans my-3">
          Are you sure you want to delete{" "}
          <strong>{currentTeam.name}</strong>? This will permanently remove all
          memberships and invitations. Datasets will be unassigned but not
          deleted.
        </p>
        <p className="font-ibm-sans text-red-500 font-semibold">
          This action cannot be undone.
        </p>
      </Modal>

      {/* Invite modal */}
      <Modal
        width={600}
        centered
        title={isInvitingMembers ? "Invite Team Members" : "Invite Team Owner"}
        open={isInviteModalOpen}
        onOk={handleCreateInvite}
        okText="Create Invitation Link"
        onCancel={() => {
          setIsInviteModalOpen(false);
          dispatch(clearInvitation());
        }}
      >
        {invitation && invitation.token ? (
          isInvitingMembers ? (
            <p className="text-base font-ibm-sans my-3 mb-6">
              Invitation link created for <strong>team members</strong>. Share
              this link with users who should join the team.
            </p>
          ) : (
            <p className="text-base font-ibm-sans my-3 mb-6">
              Invitation link created for a <strong>team owner</strong>. Share
              this link so the owner can register and take ownership of the
              team.
            </p>
          )
        ) : isInvitingMembers ? (
          <p className="text-base font-ibm-sans my-3 mb-6">
            This team already has an owner. Pressing the button will create an
            invitation link for a <strong>team member (user)</strong> to join
            the team.
          </p>
        ) : (
          <p className="text-base font-ibm-sans my-3 mb-6">
            This team has no owner yet. Pressing the button will create an
            invitation link for a <strong>team owner</strong> to register and
            take ownership of the team.
          </p>
        )}

        {invitation && invitation.token && (
          <Space>
            <a
              href={`${frontendBaseUrl}/login/?token=${invitation.token}&target_role=${invitation.target_role}`}
              target="_blank"
              rel="noreferrer"
            >
              Invitation Link
            </a>
            <Tooltip title="Copy link">
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${frontendBaseUrl}/login/?token=${invitation.token}&target_role=${invitation.target_role}`,
                  );
                  message.success("Invitation link copied!");
                }}
              />
            </Tooltip>
          </Space>
        )}
      </Modal>
    </div>
  );
};
