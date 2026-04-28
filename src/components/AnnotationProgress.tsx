/**
 * Annotation Progress Component
 * 
 * Displays progress bar showing annotation completion percentage
 */

import React from "react";
import { Card, Progress } from "antd";

interface AnnotationProgressProps {
  percent: number;
}

export const AnnotationProgress: React.FC<AnnotationProgressProps> = ({
  percent,
}) => {
  return (
    <Card size="small" bodyStyle={{ padding: 12 }}>
      <Progress
        percent={percent}
        status="active"
        size="small"
        strokeColor={{
          "0%": "#108ee9",
          "100%": "#87d068",
        }}
      />
    </Card>
  );
};

