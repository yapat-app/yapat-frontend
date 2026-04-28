/**
 * Annotation Workflow Page
 *
 * Main page for annotating audio snippets
 */

import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin, Empty, Alert, Button } from "antd";
import { NavigationBar } from "../components/NavigationBar";
import { AnnotationStatistics } from "../components/AnnotationStatistics";
import { AnnotationProgress } from "../components/AnnotationProgress";
import { CurrentSnippetCard } from "../components/CurrentSnippetCard";
import { SnippetQueuePreview } from "../components/SnippetQueuePreview";
import { useAnnotationWorkflow } from "../hooks/useAnnotationWorkflow";

export const AnnotationWorkflow: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get dataset_id from URL params (e.g., /annotate?dataset_id=1)
  const datasetId = searchParams.get("dataset_id");
  const feedId = searchParams.get("feed_id");

  // Use custom hook for workflow logic
  const {
    snippets,
    currentSnippet,
    currentIndex,
    loading,
    error,
    annotations,
    annotatedCount,
    progressPercent,
    handleAnnotationSuccess: _handleWorkflowSuccess,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
  } = useAnnotationWorkflow({ datasetId, limit: 50 });

  // Loading state
  if (loading && snippets.length === 0) {
    return (
      <div>
        <NavigationBar />
        <div className="w-full h-screen flex items-center justify-center">
          <Spin size="large" tip="Loading snippets..." />
        </div>
      </div>
    );
  }

  // Error state
  if (error && snippets.length === 0) {
    return (
      <div>
        <NavigationBar />
        <div className="w-full h-screen flex items-center justify-center">
          <Alert
            message="Error Loading Snippets"
            description={error}
            type="error"
            showIcon
          />
        </div>
      </div>
    );
  }

  // No snippets state
  if (!currentSnippet && !loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavigationBar />

        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <p className="text-2xl font-semibold mb-2 font-ibm-mono">
                  No Snippets Available
                </p>
                <p className="text-gray-500 mb-4 font-ibm-sans">
                  {datasetId
                    ? `No unannotated snippets found for dataset ${datasetId}.`
                    : "Please generate a feed to start annotating snippets."}
                </p>
                <Button
                  className="font-ibm-sans!"
                  type="primary"
                  size="large"
                  onClick={() => navigate("/datasets")}
                >
                  View Datasets
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />
      <div className="w-full flex justify-center p-4">
        <div className=" w-[85%]">
          {/* Header */}
          <div className="mb-4">
            <h1 className="text-2xl font-bold font-ibm-mono mb-1">
              Annotation
            </h1>
            <p className="text-gray-600">
              Annotate audio snippets with species labels
              {datasetId && (
                <span className="ml-2">(Dataset #{datasetId})</span>
              )}
              {feedId && <span className="ml-2">(Feed #{feedId})</span>}
            </p>
          </div>

          <div className="space-y-4">
            {/* Statistics Row */}
            <div className="pt-1">
              <AnnotationStatistics
                totalSnippets={snippets.length}
                currentIndex={currentIndex}
                annotatedCount={annotatedCount}
              />
            </div>

            {/* Progress Bar */}
            <div className="pt-1">
              <AnnotationProgress percent={progressPercent} />
            </div>

            {/* Snippet Queue Preview */}
            <div className="pt-1">
              <SnippetQueuePreview
                snippets={snippets}
                currentSnippetId={currentSnippet?.id ?? null}
              />
            </div>

            {/* Current Snippet Card */}
            {currentSnippet && (
              <div className="pt-1">
                <CurrentSnippetCard
                  snippet={currentSnippet}
                  annotations={annotations}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  canGoPrevious={canGoPrevious}
                  canGoNext={canGoNext}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
