/**
 * Annotation Form Component
 *
 * Modal form for creating annotations on audio snippets
 * Supports species name input with autocomplete
 */

import React, { useState, useEffect, useRef } from "react";
import { Modal, Select, Form, Button, message, Alert } from "antd";
import { SpeciesAutocomplete } from "./SpeciesAutocomplete";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  createAnnotation,
  clearError,
  clearLastCreated,
} from "../redux/features/annotationSlice";
import type { AnnotationCreate } from "../types";
import { getAvailableTaxonomies } from "../redux/features/taxonomySlice";

interface AnnotationFormProps {
  snippetId: number;
  // onSuccess?: (speciesName: string) => void;
}

export const AnnotationForm: React.FC<AnnotationFormProps> = ({
  snippetId,
  // onSuccess,
}) => {
  const dispatch = useAppDispatch();
  const { loading, error, lastCreated } = useAppSelector(
    (state) => state.annotation,
  );
  const { conversationFreezed } = useAppSelector(
    (state) => state.customTaxonomy,
  );
  const { taxonomies } = useAppSelector((state) => state.taxonomy);
  const [form] = Form.useForm();
  const [selectedTaxonId, setSelectedTaxonId] = useState<string | undefined>();
  const processedAnnotationId = useRef<number | null>(null);
  const [selectedTaxonomyIds, setSelectedTaxonomyIds] = useState<string[]>([]);

  useEffect(() => {
    form.resetFields();
    setSelectedTaxonId(undefined);
    dispatch(clearError());
    dispatch(clearLastCreated());
    processedAnnotationId.current = null;
  }, [form, dispatch]);

  //Handle successful annotation creation

  useEffect(() => {
    if (lastCreated && lastCreated.id !== processedAnnotationId.current) {
      processedAnnotationId.current = lastCreated.id;
      const speciesName = lastCreated.resolved_name_snapshot;
      message.success(`Annotation created: ${speciesName}`);
      form.resetFields();
      setSelectedTaxonId(undefined);
      // onSuccess?.(speciesName);
      // Clear lastCreated after processing to prevent duplicate messages
      dispatch(clearLastCreated());
    }
  }, [
    lastCreated,
    form,
    // onSuccess,
    dispatch,
  ]);

  useEffect(() => {
    //get all available taxonomies
    dispatch(getAvailableTaxonomies());
  }, [conversationFreezed]);

  // Function to handle taxonomy selection
  const handleTaxonomyChange = (values: string[]) => {
    setSelectedTaxonomyIds(values);
    console.log("Selected Taxonomy IDs:", values);
  };
  // Set the default taxonomy to the first one in the list
  useEffect(() => {
    if (taxonomies && taxonomies.length > 0) {
      setSelectedTaxonomyIds([taxonomies[0].taxonomy_id]);
    }
  }, [taxonomies]);
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

      console.log("Creating annotation with data:", annotationData);

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
    // onClose();
  };

  return (
    <div>
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

      <div className="bg-white rounded-lg p-6 shadow-md border border-slate-200">
        <div className="mb-2">
          <h3 className="text-lg font-semibold text-slate-800">
            Add Species Annotation
          </h3>
        </div>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {taxonomies && taxonomies.length > 0 && (
            <Form.Item
              label={
                <span className="text-sm font-medium text-slate-700">
                  Available Taxonomies
                </span>
              }
              name="taxonomy_id"
              initialValue={[taxonomies[0].taxonomy_id]}
              rules={[
                {
                  required: true,
                  message: "Please select at least one taxonomy",
                },
              ]}
              tooltip="Select one or more taxonomies"
            >
              <Select
                mode="multiple"
                showSearch
                placeholder="Select taxonomy(s)"
                value={selectedTaxonomyIds}
                onChange={handleTaxonomyChange}
              ></Select>
            </Form.Item>
          )}
          <Form.Item
            label={
              <span className="text-sm font-medium text-slate-700">
                Species Name
              </span>
            }
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
          {selectedTaxonId && (
            <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-900">
              <strong>Taxon ID:</strong> {selectedTaxonId}
            </div>
          )}
          <Form.Item className="mb-0 mt-6">
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <Button onClick={handleCancel} className="px-6">
                Clear
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                className="px-6 bg-blue-600 hover:bg-blue-700"
              >
                Create Annotation
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};
