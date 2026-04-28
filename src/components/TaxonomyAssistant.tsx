/* ============================================================================
   TAXONOMY ASSISTANT COMPONENT - API INTEGRATION GUIDE
   ============================================================================
*/

import React, { useState, useRef, useEffect } from "react";
import {
  Button,
  FloatButton,
  Card,
  Input,
  List,
  Space,
  Tag,
  Typography,
  Spin,
  message,
  Modal,
  Divider,
} from "antd";
import {
  MessageOutlined,
  CloseOutlined,
  CheckOutlined,
  SendOutlined,
  MinusOutlined,
  RobotOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { InputRef } from "antd";
import {
  startNewConversation,
  cancelConversation,
  getConversation,
  sendMessage,
  addLabels,
  resetSentMessage,
  resetAddLabel,
  getLabelSpace,
  reset,
  clearConversationFreezed,
  freezeConversation,
  removeLabels,
} from "../redux/features/customTaxonomySlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import type { LabelSpaceItem } from "../types";

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

type TaxonomyNode = {
  id: string;
  name: string;
  rank?: string;
  scientific_name?: string;
  metadata?: {
    source?: string;
  };
};

type ConversationMessage = {
  id: number;
  role: "user" | "assistant" | "system" | string;
  content: string;
  message_metadata?: {
    taxonomy_data?: {
      nodes: TaxonomyNode[];
    };
  } | null;
};

interface AIAssistantTaxonomyProps {
  onExport?: (taxonomies: LabelSpaceItem[]) => void;
  onClear?: () => void;
}

const TaxonomyAssistant: React.FC<AIAssistantTaxonomyProps> = ({
  onExport: _onExport,
  onClear,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [openFreeze, setOpenFreeze] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleFreeze = () => {
    if (conversation?.id)
      dispatch(
        freezeConversation({
          name,
          description,
          conversationId: conversation.id,
        }),
      );
    setOpenFreeze(false);
  };

  const inputRef = useRef<InputRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const {
    conversation,
    messageLoading,
    messageSent,
    labelSpace,
    labelAdded,
    labelRemoved,
    conversationFreezed,
  } = useAppSelector((state) => state.customTaxonomy);
  const { user } = useAppSelector((state) => state.auth);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Handle conversation lifecycle
  useEffect(() => {
    if (isOpen) {
      openConversation();
    } else if (!isOpen && !isMinimized) {
      closeConversation();
    }
  }, [isOpen, isMinimized]);

  // Fetch conversation updates periodically or when conversation changes
  useEffect(() => {
    if (conversation?.id && isOpen) {
      dispatch(getConversation(conversation.id));
    }
  }, [conversation?.id, isOpen]);

  // handle message Success Popup
  useEffect(() => {
    //if message sent
    if (messageSent) {
      message.success("Message Sent Successfully", undefined, () => {
        dispatch(resetSentMessage());
      });
      if (conversation?.id) {
        dispatch(getConversation(conversation.id));
      }
    }
  }, [messageSent]);

  useEffect(() => {
    //if label added
    console.log(labelAdded);
    if (labelAdded) {
      message.success(`Label Added`, undefined, () => {
        dispatch(resetAddLabel());
      });

      // Refresh conversation to get updated label space
      if (conversation?.id) {
        dispatch(getConversation(conversation.id));
        dispatch(getLabelSpace(conversation.id));
      }
    }
  }, [labelAdded]);

  useEffect(() => {
    //if label removed
    if (labelRemoved) {
      message.success(`Label Removed`, undefined, () => {
        dispatch(reset());
      });

      // Refresh conversation to get updated label space
      if (conversation?.id) {
        dispatch(getConversation(conversation.id));
        dispatch(getLabelSpace(conversation.id));
      }
    }
  }, [labelRemoved]);

  useEffect(() => {
    //if label removed
    if (conversationFreezed) {
      message.success(
        `Label space Frozen, custom taxonomies can be viewed in the annotation panel`,
        undefined,
        () => {
          dispatch(clearConversationFreezed());
        },
      );
      handleClose();
    }
  }, [conversationFreezed]);

  // Start New conversation
  const openConversation = () => {
    if (
      conversation &&
      (conversation.is_frozen === true || conversation.status === "cancelled")
    ) {
      console.log(user?.team_ids);
      dispatch(
        startNewConversation(user?.team_ids?.length ? user?.team_ids[0] : null),
      );
    } else if (!conversation) {
      dispatch(
        startNewConversation(user?.team_ids?.length ? user?.team_ids[0] : null),
      );
    }
  };

  // Cancel Conversation
  const closeConversation = () => {
    if (conversation?.id) {
      dispatch(cancelConversation(conversation.id));
    }
  };

  const handleToggleChat = () => {
    setIsOpen(!isOpen);
    setIsMinimized(false);
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
    setInputValue("");
    onClear?.();
  };

  //send Message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || messageLoading || !conversation?.id) return;

    const promptText = inputValue.trim();
    setInputValue(""); // Clear input immediately for better UX

    dispatch(
      sendMessage({
        conversationId: conversation.id,
        prompt: promptText,
      }),
    );
    /* ==========================================
         📍 API INTEGRATION POINT #1: SEND MESSAGE
         ==========================================
      */
  };

  // Add single taxonomy or multiple taxonomies based on indices array
  const handleAddToLabelSpace = async (
    messageId: number,
    indices: number[],
  ) => {
    if (!indices || indices.length === 0) {
      message.warning("No taxonomies to add");
      return;
    }

    if (!conversation?.id) {
      message.error("No active conversation");
      return;
    }

    try {
      await dispatch(
        addLabels({
          conversationId: conversation.id,
          messageId: messageId,
          indices: indices,
        }),
      ).unwrap();
    } catch (error) {
      message.error("Failed to add to label space. Please try again.");
      console.error("API Error:", error);
    }
  };

  // Add all taxonomies from a message
  const handleAddAllTaxonomies = (messageId: number, totalCount: number) => {
    // Create an array of all indices [1, 2, 3, ..., totalCount]
    const allIndices = Array.from({ length: totalCount }, (_, i) => i + 1);
    handleAddToLabelSpace(messageId, allIndices);
  };

  // Add a single taxonomy at a specific index (now starting from 1)
  const handleAddSingleTaxonomy = (messageId: number, index: number) => {
    // Ensure the index is treated as 1-based
    handleAddToLabelSpace(messageId, [index + 1]);
  };

  const handleRemoveFromLabelSpace = async (itemId: number | string) => {
    if (!conversation?.id) {
      message.error("No active conversation");
      return;
    }

    /* ==========================================
          REMOVE LABEL
         ==========================================  
      */

    dispatch(
      removeLabels({
        conversationId: conversation.id,
        itemId: typeof itemId === "string" ? Number(itemId) : itemId,
      }),
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const renderMessage = (
    msg:
      | ConversationMessage
      | {
          id: number;
          role: string;
          content: string;
          message_metadata?: {
            taxonomy_data?: { nodes: TaxonomyNode[] };
          } | null;
        },
  ) => {
    if (msg.role === "user") {
      return (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <div
            style={{
              background: "#1890ff",
              color: "white",
              padding: "12px 16px",
              borderRadius: "16px 16px 0 16px",
              maxWidth: "70%",
              fontSize: 15,
            }}
          >
            {msg.content}
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#1890ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              flexShrink: 0,
            }}
          >
            <UserOutlined />
          </div>
        </div>
      );
    }

    if (msg.role === "assistant") {
      const taxonomies: TaxonomyNode[] =
        msg.message_metadata?.taxonomy_data?.nodes || [];

      return (
        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#52c41a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              flexShrink: 0,
            }}
          >
            <RobotOutlined />
          </div>
          <div
            style={{
              background: "white",
              padding: "16px 18px",
              borderRadius: "16px 16px 16px 0",
              maxWidth: "80%",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              flex: 1,
            }}
          >
            <Text style={{ fontSize: 15 }}>{msg.content}</Text>

            {taxonomies.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Divider style={{ margin: "16px 0" }} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text strong style={{ fontSize: 14, color: "#666" }}>
                    Suggested Taxonomies ({taxonomies.length}):
                  </Text>
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() =>
                      handleAddAllTaxonomies(msg.id, taxonomies.length)
                    }
                  >
                    Add All
                  </Button>
                </div>
                <List
                  size="small"
                  dataSource={taxonomies}
                  style={{ marginTop: 12 }}
                  renderItem={(item: TaxonomyNode, index) => (
                    <List.Item
                      style={{
                        padding: "12px 0",
                        border: "none",
                      }}
                      actions={[
                        <Button
                          type="primary"
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={() => handleAddSingleTaxonomy(msg.id, index)}
                        >
                          Add
                        </Button>,
                      ]}
                    >
                      <Space direction="vertical" size={4} style={{ flex: 1 }}>
                        <Text strong style={{ fontSize: 15 }}>
                          {item.name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          {item.scientific_name}
                        </Text>
                        <Space size={4} wrap>
                          <Tag color="blue" style={{ fontSize: 11 }}>
                            {item.id}
                          </Tag>
                          <Tag color="green" style={{ fontSize: 11 }}>
                              {item.metadata?.source ?? "unknown"}
                          </Tag>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <FloatButton
          icon={<MessageOutlined />}
          type="primary"
          style={{ width: 60, height: 60 }}
          onClick={handleToggleChat}
          tooltip="Taxonomy Assistant"
          badge={{
            dot: isMinimized,
            color: "#52c41a",
          }}
        />
      )}

      <Modal
        title="Freeze label space"
        centered
        open={openFreeze}
        onCancel={() => setOpenFreeze(false)}
        footer={[
          <Button key="cancel" onClick={() => setOpenFreeze(false)}>
            Cancel
          </Button>,
          <Button key="freeze" type="primary" onClick={handleFreeze}>
            Freeze
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <label>Name:</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter name"
          />
        </div>
        <div>
          <label>Description:</label>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter description"
          />
        </div>
      </Modal>

      {/* Backdrop Blur */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            backdropFilter: "blur(4px)",
            zIndex: 999,
          }}
          onClick={handleMinimize}
        />
      )}

      {/* Chat Interface */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90vw",
            maxWidth: "1200px",
            height: "85vh",
            maxHeight: "900px",
            zIndex: 1000,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            borderRadius: 16,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Card
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
            bodyStyle={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                background: "#4196FF",
                color: "white",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Space>
                <MessageOutlined style={{ fontSize: 22 }} />
                <Text strong style={{ color: "white", fontSize: 18 }}>
                  Taxonomy Assistant
                </Text>
              </Space>
              <Space>
                <Button
                  type="text"
                  icon={<MinusOutlined />}
                  onClick={handleMinimize}
                  style={{ color: "white" }}
                  title="Minimize"
                />
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={handleClose}
                  style={{ color: "white" }}
                  title="Close and clear conversation"
                />
              </Space>
            </div>

            {/* Messages Area */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px",
                background: "#f5f5f5",
              }}
            >
              {!conversation?.messages || conversation.messages.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "80px 40px",
                    color: "#999",
                  }}
                >
                  <MessageOutlined
                    style={{ fontSize: 64, marginBottom: 24, opacity: 0.3 }}
                  />
                  <Paragraph type="secondary" style={{ fontSize: 16 }}>
                    Start a conversation to get taxonomy suggestions for your
                    annotations.
                  </Paragraph>
                  <Paragraph type="secondary" style={{ fontSize: 14 }}>
                    Example: "suggest me taxonomies to annotate birds"
                  </Paragraph>
                </div>
              ) : (
                <>
                  {conversation.messages.map((msg) => (
                    <div key={msg.id} style={{ marginBottom: 20 }}>
                      {renderMessage(msg)}
                    </div>
                  ))}
                </>
              )}

              {messageLoading && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      background: "white",
                      padding: "16px 24px",
                      borderRadius: "16px 16px 16px 0",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    }}
                  >
                    <Spin size="small" />
                    <Text
                      style={{ marginLeft: 12, color: "#999", fontSize: 15 }}
                    >
                      Analyzing...
                    </Text>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Label Space */}
            {labelSpace && labelSpace.length > 0 && (
              <div
                style={{
                  padding: "16px 24px",
                  background: "white",
                  borderTop: "1px solid #f0f0f0",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text strong style={{ fontSize: 15 }}>
                    Label Space ({labelSpace.length})
                  </Text>
                  <Space size="small">
                    <Button
                      size="middle"
                      type="primary"
                      onClick={() => setOpenFreeze(true)}
                      // onClick={handleExportLabelSpace}
                    >
                      Freeze
                    </Button>
                  </Space>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {labelSpace.map((item) => (
                    <Tag
                      key={item.id}
                      closable
                      onClose={() => handleRemoveFromLabelSpace(item.id)}
                      color="purple"
                      style={{
                        marginBottom: 4,
                        padding: "4px 10px",
                        fontSize: 13,
                      }}
                    >
                      {item.name} ({item.taxon_id})
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div
              style={{
                padding: "16px 24px",
                background: "white",
                borderTop: "1px solid #f0f0f0",
              }}
            >
              <Space.Compact style={{ width: "100%" }}>
                <TextArea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Example: suggest me taxonomies to annotate birds..."
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  disabled={messageLoading}
                  style={{
                    resize: "none",
                    borderRadius: "10px 0 0 10px",
                    fontSize: 15,
                  }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSendMessage}
                  loading={messageLoading}
                  disabled={!inputValue.trim()}
                  style={{
                    height: "auto",
                    borderRadius: "0 10px 10px 0",
                    fontSize: 15,
                    padding: "0 24px",
                  }}
                >
                  Send
                </Button>
              </Space.Compact>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default TaxonomyAssistant;
