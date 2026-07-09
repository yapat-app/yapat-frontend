import { useEffect, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { Card, Table, Modal, Button, Input, Select, Tag, message } from "antd";
import type { TableProps } from "antd";
import {
  fetchUsersAsync,
  createUserAsync,
  resetUserCreated,
} from "../redux/features/authSlice";
import type { User } from "../types";

const ROLE_TAG_COLOR: Record<User["role"], string> = {
  admin: "gold",
  team_owner: "blue",
  user: "default",
};

export const AdminUsers = () => {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { allUsers, usersLoading, userCreated, adminUserError } =
    useAppSelector((state: any) => state.auth);

  const [newUser, setNewUser] = useState<{
    username: string;
    full_name: string;
    password: string;
    role: "user" | "team_owner" | "admin";
  }>({ username: "", full_name: "", password: "", role: "user" });

  useEffect(() => {
    dispatch(fetchUsersAsync());
  }, [dispatch]);

  useEffect(() => {
    if (userCreated) {
      message.success("User created");
      setIsModalOpen(false);
      setNewUser({ username: "", full_name: "", password: "", role: "user" });
      dispatch(resetUserCreated());
      dispatch(fetchUsersAsync());
    }
  }, [userCreated, dispatch]);

  useEffect(() => {
    if (adminUserError) {
      message.error(
        typeof adminUserError === "string"
          ? adminUserError
          : "Something went wrong",
      );
    }
  }, [adminUserError]);

  const onValueChange = (name: string, value: string) => {
    setNewUser((prev) => ({ ...prev, [name]: value }));
  };

  const createNewUser = () => {
    dispatch(
      createUserAsync({
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
        full_name: newUser.full_name || undefined,
      }),
    );
  };

  const columns: TableProps<User>["columns"] = [
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
    },
    {
      title: "Full Name",
      dataIndex: "full_name",
      key: "full_name",
      render: (value) => value || "—",
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: User["role"]) => (
        <Tag color={ROLE_TAG_COLOR[role]}>
          {role === "team_owner" ? "Team Owner" : role}
        </Tag>
      ),
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      render: (value) => (value ? new Date(value).toLocaleDateString() : "—"),
    },
  ];

  const showModal = () => setIsModalOpen(true);
  const handleCancel = () => setIsModalOpen(false);

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[85%]">
          <div className="my-6">
            <h1 className="text-2xl font-bold font-ibm-mono">Users</h1>
            <p className="sub_description_text">
              Below you can view all accounts and create new users, including
              additional admins
            </p>

            <Modal
              centered
              title="Create User"
              closable={{ "aria-label": "Custom Close Button" }}
              open={isModalOpen}
              onOk={createNewUser}
              okText="Create User"
              onCancel={handleCancel}
              confirmLoading={usersLoading}
              okButtonProps={{
                disabled:
                  !newUser.username.trim() || newUser.password.length < 8,
              }}
            >
              <div>
                <p className="font-ibm-sans input_heading_text">
                  Username <span style={{ color: "red" }}>*</span>
                </p>
                <Input
                  style={{
                    fontFamily: "IBM Plex Sans, sans-serif",
                    margin: "0px 0px 10px 0px",
                    padding: "10px",
                    backgroundColor: "#F7FBFF",
                    color: "#8897AD",
                  }}
                  name="username"
                  value={newUser.username}
                  placeholder="Enter Username"
                  onChange={(e) => onValueChange("username", e.target.value)}
                />
              </div>

              <div>
                <p className="font-ibm-sans input_heading_text">Full Name</p>
                <Input
                  style={{
                    fontFamily: "IBM Plex Sans, sans-serif",
                    margin: "0px 0px 10px 0px",
                    padding: "10px",
                    backgroundColor: "#F7FBFF",
                    color: "#8897AD",
                  }}
                  name="full_name"
                  value={newUser.full_name}
                  placeholder="Enter Full Name"
                  onChange={(e) => onValueChange("full_name", e.target.value)}
                />
              </div>

              <div>
                <p className="font-ibm-sans input_heading_text">
                  Password <span style={{ color: "red" }}>*</span>
                </p>
                <Input.Password
                  style={{
                    fontFamily: "IBM Plex Sans, sans-serif",
                    margin: "0px 0px 10px 0px",
                    padding: "10px",
                    backgroundColor: "#F7FBFF",
                    color: "#8897AD",
                  }}
                  name="password"
                  value={newUser.password}
                  placeholder="At least 8 characters"
                  onChange={(e) => onValueChange("password", e.target.value)}
                  visibilityToggle
                />
              </div>

              <div>
                <p className="font-ibm-sans input_heading_text">Role</p>
                <Select
                  style={{ width: "100%", marginBottom: 10 }}
                  value={newUser.role}
                  onChange={(value) => onValueChange("role", value)}
                  options={[
                    { value: "user", label: "User" },
                    { value: "team_owner", label: "Team Owner" },
                    { value: "admin", label: "Admin" },
                  ]}
                />
              </div>
            </Modal>
          </div>

          <Card variant="borderless">
            <div className="flex justify-between items-center">
              <h1 className="card_heading_text">All Users</h1>
              <Button type="primary" onClick={showModal}>
                Create User
              </Button>
            </div>
            <Table<User>
              rowKey="id"
              columns={columns}
              dataSource={allUsers}
              loading={usersLoading && allUsers.length === 0}
            />
          </Card>
        </div>
      </div>
    </div>
  );
};
