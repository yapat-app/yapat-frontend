/**
 * Annotation Workflow Page
 *
 * Main page for annotating audio snippets
 */

import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Spin, Empty, Alert, message } from "antd";
import { NavigationBar } from "../components/NavigationBar";
import { AnnotationForm } from "../components/AnnotationForm";
import { AnnotationStatistics } from "../components/AnnotationStatistics";
import { AnnotationProgress } from "../components/AnnotationProgress";
import { CurrentSnippetCard } from "../components/CurrentSnippetCard";
import { SnippetQueuePreview } from "../components/SnippetQueuePreview";
import { useAnnotationWorkflow } from "../hooks/useAnnotationWorkflow";

export const AnnotationWorkflow: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigator = useNavigate();
  const [modalVisible, setModalVisible] = useState(false);

  // Get dataset_id from URL params (e.g., /annotate?dataset_id=1)
  const datasetId = searchParams.get("dataset_id");

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
    handleAnnotationSuccess: handleWorkflowSuccess,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
  } = useAnnotationWorkflow({ datasetId, limit: 50 });

  //Handle successful annotation creation

  const handleAnnotationSuccess = () => {
    handleWorkflowSuccess();
    setModalVisible(false);
  };

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
      <div>
        <NavigationBar />
        <div className="w-full h-screen flex items-center justify-center">
          <Empty
            description={
              <div>
                <p className="text-lg font-semibold mb-2">
                  No Snippets Available
                </p>
                <p className="text-gray-500">
                  {datasetId
                    ? `No unannotated snippets found for dataset ${datasetId}`
                    : "No unannotated snippets found"}
                </p>
              </div>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />
      <div className="w-full flex justify-center p-6">
        <div className="w-full max-w-6xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold font-ibm-mono mb-2">
              Annotation
            </h1>
            <p className="text-gray-600">
              Annotate audio snippets with species labels
              {datasetId && (
                <span className="ml-2">(Dataset #{datasetId})</span>
              )}
            </p>
          </div>

          {/* Statistics Row */}
          <AnnotationStatistics
            totalSnippets={snippets.length}
            currentIndex={currentIndex}
            annotatedCount={annotatedCount}
          />

          {/* Progress Bar */}
          <AnnotationProgress percent={progressPercent} />

          {/* Current Snippet Card */}
          {currentSnippet && (
            <CurrentSnippetCard
              snippet={currentSnippet}
              annotations={annotations}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onAddAnnotation={() => setModalVisible(true)}
              canGoPrevious={canGoPrevious}
              canGoNext={canGoNext}
            />
          )}

          {/* Snippet Queue Preview */}
          <SnippetQueuePreview
            snippets={snippets}
            currentSnippetId={currentSnippet?.id ?? null}
          />
        </div>
      </div>

      {/* Annotation Form Modal */}
      {currentSnippet && (
        <AnnotationForm
          visible={modalVisible}
          snippetId={currentSnippet.id}
          onClose={() => setModalVisible(false)}
          onSuccess={handleAnnotationSuccess}
        />
      )}
    </div>
  );
};
