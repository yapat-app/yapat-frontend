import React, { useState, useRef, useEffect } from "react";
import {
  Button,
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
  freezeConversation,
  removeLabels,
} from "../redux/features/customTaxonomySlice";
import { useAppDispatch, useAppSelector } from "../hooks";

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface TaxonomyNode {
  id: string;
  name: string;
  rank: string;
  scientific_name: string;
  metadata: {
    iri: string;
    tool: string;
    score: null | number;
    source: string;
    description: null | string;
  };
}

interface MessageMetadata {
  taxonomy_data?: {
    nodes: TaxonomyNode[];
    metadata: {
      model: string;
      prompt: string;
      source: string;
      tools_called: string[];
      total_species: number;
    };
  };
  generation_metadata?: {
    model: string;
    prompt: string;
    server: string;
  };
  action?: string;
  item_ids?: string[];
}

interface ConversationMessage {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  message_metadata: MessageMetadata | null;
}

interface LabelSpaceItem {
  id: string;
  name: string;
  scientific_name: string;
  taxon_id: string;
  metadata: {
    iri: string;
    rank: string;
    tool: string;
    score: null | number;
    family: null | string;
    source: string;
    kingdom: null | string;
    description: null | string;
  };
  added_at: string;
}

const TaxonomyChatbot: React.FC = () => {
  const [openFreeze, setOpenFreeze] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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

  // ✅ Initialize conversation when component mounts
  useEffect(() => {
    // Start a new conversation if there isn't one, or if it's frozen/cancelled
    if (
      conversation &&
      (conversation.is_frozen === true || conversation.status === "cancelled")
    ) {
      dispatch(startNewConversation(1));
    } else if (!conversation) {
      dispatch(startNewConversation(1));
    }

    // Optional cleanup when component unmounts
    return () => {
      // You can add cleanup logic here if needed
      // For example, cancel conversation on unmount:
      // if (conversation?.id) {
      //   dispatch(cancelConversation(conversation.id));
      // }
    };
  }, []); // Run once on mount

  // ✅ Fetch conversation updates periodically
  useEffect(() => {
    if (conversation?.id) {
      dispatch(getConversation(conversation.id));
    }
  }, [conversation?.id]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  // Focus input when component mounts
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // handle message Success Popup
  useEffect(() => {
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
    if (labelAdded) {
      message.success(`Label Added`, undefined, () => {
        dispatch(resetAddLabel());
      });

      if (conversation?.id) {
        dispatch(getConversation(conversation.id));
        dispatch(getLabelSpace(conversation.id));
      }
    }
  }, [labelAdded]);

  useEffect(() => {
    if (labelRemoved) {
      message.success(`Label Removed`, undefined, () => {
        dispatch(reset());
      });

      if (conversation?.id) {
        dispatch(getConversation(conversation.id));
        dispatch(getLabelSpace(conversation.id));
      }
    }
  }, [labelRemoved]);

  useEffect(() => {
    if (conversationFreezed) {
      message.success(
        `Label space Frozen, custom taxonomies can be viewed in the annotation panel`,
        undefined,
        () => {
          dispatch(reset());
        },
      );
    }
  }, [conversationFreezed]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || messageLoading) return;

    const promptText = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    dispatch(
      sendMessage({
        conversationId: conversation.id,
        prompt: promptText,
      }),
    );
  };

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

  const handleAddAllTaxonomies = (messageId: number, totalCount: number) => {
    const allIndices = Array.from({ length: totalCount }, (_, i) => i + 1);
    handleAddToLabelSpace(messageId, allIndices);
  };

  const handleAddSingleTaxonomy = (messageId: number, index: number) => {
    handleAddToLabelSpace(messageId, [index + 1]);
  };

  const handleRemoveFromLabelSpace = async (itemId: number) => {
    if (!conversation?.id) {
      message.error("No active conversation");
      return;
    }

    dispatch(
      removeLabels({
        conversationId: conversation.id,
        itemId,
      }),
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const renderMessage = (msg: ConversationMessage) => {
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
      const taxonomies = msg.message_metadata?.taxonomy_data?.nodes || [];

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
                  renderItem={(item, index) => (
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
                            {item.metadata.source}
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
      {/* Freeze Modal - Separate from main chat UI */}
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

      {/* Main Chat Interface */}
      <Card
        className="Chatbot-card w-full "
        styles={{
          body: {
            padding: 0,
            width: "inherit",
            height: "100%",
          },
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            background: "#fff",
            width: "inherit",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "15px 20px",
              background: "#1990FF",
              color: "white",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Space>
              <MessageOutlined style={{ fontSize: 22 }} />
              <Text strong style={{ color: "white", fontSize: 12 }}>
                Taxonomy Assistant
              </Text>
            </Space>
          </div>

          {/* Messages Area */}
          <div
            style={{
              overflowY: "auto",
              height: "70%",
              padding: "24px",
              background: "#f5f5f5",
            }}
          >
            {!conversation?.messages || conversation.messages.length === 0 ? (
              <div
                className="flex flex-col justify-center items-center"
                style={{
                  textAlign: "center",
                  padding: "0 40px",
                  color: "#999",
                  height: "inherit",
                }}
              >
                <MessageOutlined
                  style={{ fontSize: 64, marginBottom: 24, opacity: 0.3 }}
                />
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  Start a conversation to get taxonomy suggestions for your
                  annotations.
                </Paragraph>
                <Paragraph type="secondary" style={{ fontSize: 11 }}>
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
                  <Text style={{ marginLeft: 12, color: "#999", fontSize: 15 }}>
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
                  >
                    Add To label space list
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
              padding: "10px 10px",
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
                autoSize={{ minRows: 1.5, maxRows: 4 }}
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
        </div>
      </Card>
    </>
  );
};

export default TaxonomyChatbot;
