import React, { useState, useRef, useEffect } from "react";
import {
  Button,
  Card,
  Input,
  Space,
  Tag,
  Typography,
  Spin,
  message,
  Modal,
  Divider,
  Collapse,
  Badge,
} from "antd";
import {
  MessageOutlined,
  CheckOutlined,
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import type { InputRef } from "antd";
import {
  startNewConversation,
  getConversation,
  sendMessage,
  addLabels,
  resetSentMessage,
  resetAddLabel,
  getLabelSpace,
  reset,
  freezeConversation,
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
    metadata?: {
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

const TaxonomyChatbot: React.FC = () => {
  const [openFreeze, setOpenFreeze] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const inputRef = useRef<InputRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const {
    conversation,
    messageLoading,
    messageSent,
    labelAdded,
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
    // if (
    //   conversation &&
    //   (conversation.is_frozen === true || conversation.status === "cancelled")
    // ) {
    dispatch(startNewConversation(1));
    // } else if (!conversation) {
    //   dispatch(startNewConversation(1));
    // }

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
      setPendingMessage(null);
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

  // useEffect(() => {
  //   if (labelRemoved) {
  //     message.success(`Label Removed`, undefined, () => {
  //       dispatch(reset());
  //     });

  //     if (conversation?.id) {
  //       dispatch(getConversation(conversation.id));
  //       dispatch(getLabelSpace(conversation.id));
  //     }
  //   }
  // }, [labelRemoved]);

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
    if (!inputValue.trim() || messageLoading || !conversation?.id) return;

    const promptText = inputValue.trim();
    setPendingMessage(promptText);
    setInputValue("");

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
      console.log(error);
    }
  };

  const handleAddAllTaxonomies = (messageId: number, totalCount: number) => {
    const allIndices = Array.from({ length: totalCount }, (_, i) => i + 1);
    handleAddToLabelSpace(messageId, allIndices);
  };

  const handleAddSingleTaxonomy = (messageId: number, index: number) => {
    handleAddToLabelSpace(messageId, [index + 1]);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Helper to clean and extract summary from response
  const extractSummary = (content: string): string => {
    // Remove markdown formatting and extract a clean summary
    const lines = content.split('\n');
    const summaryLines: string[] = [];
    
    for (const line of lines) {
      const cleaned = line
        .replace(/^#{1,6}\s+/, '') // Remove markdown headers
        .replace(/\*\*/g, '') // Remove bold markers
        .trim();
      
      // Skip technical lines with IDs, IRIs, etc
      if (cleaned && 
          !cleaned.startsWith('**') &&
          !cleaned.includes('ID:**') &&
          !cleaned.includes('IRI:**') &&
          !cleaned.includes('Source:**') &&
          !cleaned.includes('Description:**') &&
          !cleaned.includes('Feel free') &&
          cleaned.length > 10) {
        summaryLines.push(cleaned);
        if (summaryLines.length >= 2) break; // Get first 2 meaningful lines
      }
    }
    
    return summaryLines.join(' ') || 'Found relevant taxonomies for your query.';
  };

  const getSourceColor = (source: string): string => {
    const colors: Record<string, string> = {
      'gbif': '#1890ff',
      'envo': '#52c41a',
      'wikipedia': '#fa8c16',
      'ols': '#722ed1',
      'local': '#13c2c2',
    };
    return colors[source.toLowerCase()] || '#1890ff';
  };

  const getSourceIcon = (source: string) => {
    const icons: Record<string, React.ReactNode> = {
      'gbif': <ExperimentOutlined />,
      'envo': <EnvironmentOutlined />,
      'wikipedia': <InfoCircleOutlined />,
    };
    return icons[source.toLowerCase()] || <InfoCircleOutlined />;
  };

  const renderTaxonomyCard = (item: TaxonomyNode, index: number, messageId: number) => {
    const collapseItems = [
      {
        key: '1',
        label: (
          <Space size={4}>
            <InfoCircleOutlined style={{ fontSize: 12 }} />
            <span style={{ fontSize: 12 }}>Details</span>
          </Space>
        ),
        children: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {item.metadata.description && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Description:</Text>
                <Paragraph 
                  style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }} 
                  ellipsis={{ rows: 3, expandable: true, symbol: 'more' }}
                >
                  {item.metadata.description}
                </Paragraph>
              </div>
            )}
            {item.metadata.iri && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Reference:</Text>
                <div style={{ marginTop: 4 }}>
                  <a 
                    href={item.metadata.iri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, wordBreak: 'break-all' }}
                  >
                    <LinkOutlined /> {item.metadata.iri}
                  </a>
                </div>
              </div>
            )}
            {item.id && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>ID: </Text>
                <Text code style={{ fontSize: 11 }}>{item.id}</Text>
              </div>
            )}
            {item.metadata.score && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Confidence: </Text>
                <Tag color="blue" style={{ fontSize: 11 }}>
                  {(item.metadata.score * 100).toFixed(0)}%
                </Tag>
              </div>
            )}
          </Space>
        ),
      },
    ];

    return (
      <Card
        key={index}
        size="small"
        style={{
          marginBottom: 12,
          borderRadius: 8,
          border: '1px solid #f0f0f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space direction="vertical" size={6} style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: 15, color: '#262626' }}>
                {item.name}
              </Text>
              <Badge 
                count={getSourceIcon(item.metadata.source)} 
                style={{ 
                  backgroundColor: getSourceColor(item.metadata.source),
                  fontSize: 10
                }} 
              />
            </div>
            
            {item.scientific_name && item.scientific_name !== item.name && (
              <Text italic type="secondary" style={{ fontSize: 13 }}>
                {item.scientific_name}
              </Text>
            )}
            
            <Space size={4} wrap style={{ marginTop: 4 }}>
              <Tag 
                color={getSourceColor(item.metadata.source)} 
                style={{ fontSize: 11, margin: 0 }}
              >
                {item.metadata.source.toUpperCase()}
              </Tag>
              {item.rank && (
                <Tag color="default" style={{ fontSize: 11, margin: 0 }}>
                  {item.rank}
                </Tag>
              )}
            </Space>

            {(item.metadata.description || item.metadata.iri || item.id) && (
              <Collapse
                ghost
                size="small"
                items={collapseItems}
                style={{ marginTop: 4 }}
              />
            )}
          </Space>

          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleAddSingleTaxonomy(messageId, index)}
            style={{ marginLeft: 12, flexShrink: 0 }}
          >
            Add
          </Button>
        </div>
      </Card>
    );
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
      const summary = extractSummary(msg.content);

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
            {/* Clean summary instead of raw content */}
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text style={{ fontSize: 15, lineHeight: 1.6 }}>{summary}</Text>
              {taxonomies.length > 0 && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Found {taxonomies.length} relevant {taxonomies.length === 1 ? 'taxonomy' : 'taxonomies'}
                </Text>
              )}
            </Space>

            {taxonomies.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Divider style={{ margin: "16px 0 12px 0" }} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Space>
                    <Text strong style={{ fontSize: 14, color: "#262626" }}>
                      Suggested Taxonomies
                    </Text>
                    <Badge 
                      count={taxonomies.length} 
                      style={{ backgroundColor: '#52c41a' }} 
                    />
                  </Space>
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
                
                <div>
                  {taxonomies.map((item, index) => 
                    renderTaxonomyCard(item, index, msg.id)
                  )}
                </div>
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

          <div
            style={{
              overflowY: "auto",
              height: "98%",
              padding: "24px",
              background: "#f5f5f5",
            }}
          >
            {(!conversation?.messages || conversation.messages.length === 0) &&
            !pendingMessage ? (
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
                {conversation?.messages?.map((msg) => (
                  <div key={msg.id} style={{ marginBottom: 20 }}>
                    {renderMessage(msg)}
                  </div>
                ))}
                {pendingMessage && conversation?.id && (
                  <div style={{ marginBottom: 20 }}>
                    {renderMessage({
                      id: -1,
                      conversation_id: conversation.id,
                      role: "user",
                      content: pendingMessage,
                      message_metadata: null,
                    })}
                  </div>
                )}
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
