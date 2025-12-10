/**
 * Annotation Statistics Component
 * 
 * Displays statistics about the annotation workflow:
 * - Total snippets
 * - Current position
 * - Annotated count
 * - Remaining count
 */

import React from "react";
import { Card, Statistic, Row, Col } from "antd";
import { SoundOutlined, CheckCircleOutlined } from "@ant-design/icons";

interface AnnotationStatisticsProps {
  totalSnippets: number;
  currentIndex: number;
  annotatedCount: number;
}

export const AnnotationStatistics: React.FC<AnnotationStatisticsProps> = ({
  totalSnippets,
  currentIndex,
  annotatedCount,
}) => {
  const remainingCount = totalSnippets - annotatedCount;

  return (
    <Row gutter={16} className="mb-6">
      <Col span={6}>
        <Card>
          <Statistic
            title="Total Snippets"
            value={totalSnippets}
            prefix={<SoundOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="Current Position"
            value={currentIndex + 1}
            suffix={`/ ${totalSnippets}`}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="Annotated"
            value={annotatedCount}
            valueStyle={{ color: "#3f8600" }}
            prefix={<CheckCircleOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="Remaining"
            value={remainingCount}
            valueStyle={{ color: "#cf1322" }}
          />
        </Card>
      </Col>
    </Row>
  );
};

