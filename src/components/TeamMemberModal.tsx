import { useState } from "react";
import { Modal } from "antd";
// import type { TableProps } from "antd";
// import { useAppDispatch, useAppSelector } from "../hooks";
// import { fetchAllTeamMembers } from "../redux/features/teamSlice";

export const TeamMemberModal = ({
  record,
}: {
  record: { name: "string"; id: number };
}) => {
  // const dispatch = useAppDispatch();
  // const { allTeamMembers } = useAppSelector((state) => state.team);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // interface DataType {
  //   membership_id: number;
  //   user_id: number;
  //   username: "string";
  //   full_name: "string";
  //   role: "owner";
  // }

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  const createTeamMemberInvitationLink = () => {};

  // useEffect(() => {
  //   if (isModalOpen) {
  //     if (record.id) {
  //       dispatch(fetchAllTeamMembers(record.id));
  //     }
  //   }
  // }, [isModalOpen]);

  return (
    <div>
      <a onClick={showModal}>{record.name}</a>
      <Modal
        centered
        title="All Members"
        closable={{ "aria-label": "Custom Close Button" }}
        open={isModalOpen}
        onOk={createTeamMemberInvitationLink}
        // loading={invitationLoading}
        okText="Create Invitation Link"
        onCancel={handleCancel}
        footer={null}

        // footer={invitationCreated ? null : undefined}
      >
        {/* {allTeamMembers && allTeamMembers.length > 0 ? (
          <Table<DataType> columns={columns} dataSource={allTeamMembers} />
        ) : (
          <div>
            <p> No teams to display</p>
          </div>
        )} */}
      </Modal>
    </div>
  );
};
