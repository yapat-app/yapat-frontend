/**
 * Species Autocomplete Component
 *
 * Provides real-time species name suggestions as users type
 * Uses GBIF taxonomy service via backend API
 */

import React, { useState, useCallback } from "react";
import { AutoComplete, Spin } from "antd";
import type { DefaultOptionType } from "antd/es/select";
import { debounce } from "lodash";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  getSuggestions,
  clearSuggestions,
} from "../redux/features/taxonomySlice";

interface SpeciesAutocompleteProps {
  value?: string;
  onChange?: (value: string, taxonId?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const SpeciesAutocomplete: React.FC<SpeciesAutocompleteProps> = ({
  value,
  onChange,
  placeholder = "Search for species (e.g., 'Turdus merula')...",
  disabled = false,
  className = "",
}) => {
  const dispatch = useAppDispatch();
  const { suggestions, loading } = useAppSelector((state) => state.taxonomy);
  const [searchValue, setSearchValue] = useState(value || "");

  /**
   * Debounced search function
   * Waits 300ms after user stops typing before making API call
   */
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      if (query && query.length >= 2) {
        dispatch(getSuggestions({ query, limit: 10 }));
      } else {
        dispatch(clearSuggestions());
      }
    }, 300),
    [dispatch],
  );

  /**
   * Handle search input change
   */
  const handleSearch = (value: string) => {
    setSearchValue(value);
    debouncedSearch(value);
  };

  /**
   * Handle selection from dropdown
   */
  const handleSelect = (value: string, option: DefaultOptionType) => {
    console.log("Selected:", value, option);
    const taxonId = option.taxonId as string;
    // Get the canonical name from the original suggestion
    const selectedTaxon = suggestions.find((t) => t.taxon_id === taxonId);
    const displayName =
      selectedTaxon?.canonical_name || selectedTaxon?.scientific_name || "";

    setSearchValue(displayName);
    onChange?.(displayName, taxonId);

    // Clear suggestions after selection
    dispatch(clearSuggestions());
  };

  /**
   * Extract taxon ID number for display (e.g., "gbif:2420576" -> "2420576")
   */
  const extractTaxonIdNumber = (taxonId: string): string => {
    const parts = taxonId.split(":");
    return parts.length > 1 ? parts[1] : taxonId;
  };

  /**
   * Format suggestions as AutoComplete options with labels
   */
  const options: DefaultOptionType[] = suggestions.map((taxon) => {
    const canonicalName = taxon.canonical_name || "";
    const scientificName = taxon.scientific_name || "";
    const displayName = canonicalName || scientificName;
    const taxonIdNumber = extractTaxonIdNumber(taxon.taxon_id);
    const rank = taxon.rank;
    const kingdom = taxon.kingdom;
    const status = taxon.status;

    return {
      value: taxon.taxon_id,
      label: (
        <div className="py-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">{displayName}</span>
            <span className="text-xs text-gray-400 font-mono ml-2">
              ID: {taxonIdNumber}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {rank && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                {rank}
              </span>
            )}
            {kingdom && (
              <span className="text-xs text-gray-600">{kingdom}</span>
            )}
            {status && status !== "ACCEPTED" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
                {status}
              </span>
            )}
            {scientificName && scientificName !== canonicalName && (
              <span className="text-xs text-blue-600 italic">
                {scientificName}
              </span>
            )}
          </div>
        </div>
      ),
      taxonId: taxon.taxon_id,
      taxonIdNumber,
      scientificName:
        scientificName && scientificName !== canonicalName
          ? scientificName
          : null,
      rank,
      kingdom,
      status,
    };
  });

  return (
    <AutoComplete
      value={searchValue}
      options={options}
      onSearch={handleSearch}
      onSelect={handleSelect}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full ${className}`}
      notFoundContent={
        loading ? (
          <div className="text-center py-2">
            <Spin size="small" />
          </div>
        ) : searchValue.length < 2 ? (
          <div className="text-center py-2 text-gray-500 text-sm">
            Type at least 2 characters to search
          </div>
        ) : (
          <div className="text-center py-2 text-gray-500 text-sm">
            No species found
          </div>
        )
      }
      filterOption={false} // filtering is handled on the backend
    />
  );
};
