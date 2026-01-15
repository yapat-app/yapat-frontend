/**
 * Annotation Form Component
 *
 * Modal form for creating annotations on audio snippets
 * Supports species name input with autocomplete
 */

import React, { useState, useEffect, useRef } from "react";
import { Modal, Form, InputNumber, Input, Button, message, Alert } from "antd";
import { SpeciesAutocomplete } from "./SpeciesAutocomplete";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  createAnnotation,
  clearError,
  clearLastCreated,
} from "../redux/features/annotationSlice";
import type { AnnotationCreate } from "../types";

interface AnnotationFormProps {
  visible: boolean;
  snippetId: number;
  onClose: () => void;
  onSuccess?: (speciesName: string) => void;
}

export const AnnotationForm: React.FC<AnnotationFormProps> = ({
  visible,
  snippetId,
  onClose,
  onSuccess,
}) => {
  const dispatch = useAppDispatch();
  const { loading, error, lastCreated } = useAppSelector(
    (state) => state.annotation
  );
  const [form] = Form.useForm();
  const [selectedTaxonId, setSelectedTaxonId] = useState<string | undefined>();
  const processedAnnotationId = useRef<number | null>(null);

  //Reset form when modal opens/closes

  useEffect(() => {
    if (visible) {
      form.resetFields();
      setSelectedTaxonId(undefined);
      dispatch(clearError());
      dispatch(clearLastCreated());
      processedAnnotationId.current = null;
    }
  }, [visible, form, dispatch]);

  //Handle successful annotation creation

  useEffect(() => {
    if (
      lastCreated &&
      visible &&
      lastCreated.id !== processedAnnotationId.current
    ) {
      processedAnnotationId.current = lastCreated.id;
      const speciesName = lastCreated.resolved_name_snapshot;
      message.success(`Annotation created: ${speciesName}`);
      form.resetFields();
      setSelectedTaxonId(undefined);
      onSuccess?.(speciesName);
      // Clear lastCreated after processing to prevent duplicate messages
      dispatch(clearLastCreated());
    }
  }, [lastCreated, visible, form, onSuccess, dispatch]);

  //Handle form submission

  const handleSubmit = async (values: any) => {
    try {
      const annotationData: AnnotationCreate = {
        snippet_id: snippetId,
        species_name: values.species_name,
      };

      // Use taxon_id if we have it from autocomplete
      if (selectedTaxonId) {
        delete annotationData.species_name;
        annotationData.taxon_id = selectedTaxonId;
      }

      await dispatch(createAnnotation(annotationData)).unwrap();
      // Success handling is done in useEffect above
    } catch (error: any) {
      // Error is already in state, will be displayed
      message.error(error || "Failed to create annotation");
    }
  };

  //Handle species selection from autocomplete

  const handleSpeciesChange = (speciesName: string, taxonId?: string) => {
    form.setFieldsValue({ species_name: speciesName });
    setSelectedTaxonId(taxonId);
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    form.resetFields();
    setSelectedTaxonId(undefined);
    dispatch(clearError());
    onClose();
  };

  return (
    <Modal
      title="Add Species Annotation"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
      destroyOnHidden
    >
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          closable
          onClose={() => dispatch(clearError())}
          className="mb-4"
        />
      )}

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Species Name"
          name="species_name"
          rules={[
            {
              required: true,
              message: "Please select or enter a species name",
            },
            { min: 2, message: "Species name must be at least 2 characters" },
          ]}
          tooltip="Start typing to get species suggestions from GBIF database"
        >
          <SpeciesAutocomplete
            onChange={handleSpeciesChange}
            placeholder="e.g., 'Turdus merula' or 'Common Blackbird'"
          />
        </Form.Item>

        <Form.Item className="mb-0">
          <div className="flex gap-2 justify-end">
            <Button onClick={handleCancel}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Create Annotation
            </Button>
          </div>
        </Form.Item>
      </Form>

      {selectedTaxonId && (
        <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-900">
          <strong>Taxon ID:</strong> {selectedTaxonId}
        </div>
      )}
    </Modal>
  );
};
