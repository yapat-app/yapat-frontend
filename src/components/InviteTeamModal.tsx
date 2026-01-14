/**
 * Invite Teams to datasets modal
 */

import React, { useEffect, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { Flex, Space, Modal, Button, Checkbox } from "antd";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import {
  createInvitation,
  resetInvitationState,
} from "../redux/features/invitationSlice";

export const InviteTeamModal = () => {
  const dispatch = useAppDispatch();
  const CheckboxGroup = Checkbox.Group;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkedList, setCheckedList] = useState<string[]>([]);
  const { invitationLoading, invitationCreated, invitationLinkToken } =
    useAppSelector((state: any) => state.invitation);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state: any) => state.auth);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  const onChange = (list: string[]) => {
    console.log("changed list", list);
    setCheckedList(list);
  };

  const createInvitationLink = () => {
    // setIsModalOpen(false);
    dispatch(
      createInvitation({
        dataset_ids: checkedList,
      })
    );
  };

  useEffect(() => {
    dispatch(fetchAllDatasets());
  }, []);

  return (
    <div className="flex justify-between items-center">
      {user && user.role === "admin" && (
        <Button type="primary" onClick={showModal}>
          Invite Teams
        </Button>
      )}
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
    </div>
  );
};
