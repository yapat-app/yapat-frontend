import React, { useEffect } from "react";
import { Card, Tag, Typography, Space, Button } from "antd";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getFeedHistory } from "../redux/features/feedSlice";
import {
  clearSnippets,
  loadSnippets,
  setFeedId,
} from "../redux/features/snippetSlice";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const { Text } = Typography;

/* ----------------------------------
 Component
-----------------------------------*/

export const FeedHistory: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigator = useNavigate();
  const { feedHistory } = useAppSelector((state) => state.feed);

  useEffect(() => {
    dispatch(getFeedHistory());
    dispatch(clearSnippets());
  }, [dispatch]);

  // useEffect(() => {
  //   console.log(snippetsFetched, snippets);
  //   if (snippetsFetched && snippets.length > 0) {

  //   }
  // }, [snippetsFetched, snippets, navigator]);

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[85%]">
          <section style={{ padding: "24px" }}>
            <h1 className="text-2xl font-bold font-ibm-mono">Feed History</h1>
            <p className="sub_description_text">
              Review previously generated feeds and their configuration.
            </p>
            <div
              className="flex flex-col gap-5 max-h-[70vh] overflow-auto"
              style={{ marginTop: 24 }}
            >
              {feedHistory && feedHistory.length > 0 ? (
                feedHistory
                  .slice(-5) // take last 5 items
                  .map((feed) => (
                    <div key={feed.id}>
                      <Card
                        title={`Feed ${feed.id}`}
                        bordered
                        hoverable
                        actions={[
                          <Button
                            onClick={() => {
                              dispatch(setFeedId(feed.id));
                              dispatch(loadSnippets(feed));
                              navigator(`/annotate?feed_id=${feed.id}`);
                            }}
                          >
                            View Feed
                          </Button>,
                        ]}
                      >
                        <Space direction="vertical" size="small">
                          <Text>
                            <strong>Feed Method:</strong>{" "}
                            <Tag>{feed.method}</Tag>
                          </Text>

                          <Text>
                            <strong>Snippets Generated:</strong>{" "}
                            {feed.response?.length}
                          </Text>

                          <Text>
                            <strong>Created At:</strong>{" "}
                            {format(
                              new Date(feed.created_at),
                              "MMMM do yyyy, hh:mm:ss",
                            )}
                          </Text>
                        </Space>
                      </Card>
                    </div>
                  ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
                  <Text strong>No feed history found</Text>
                  <Text type="secondary">
                    Generate a feed to start seeing feed history here.
                  </Text>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
