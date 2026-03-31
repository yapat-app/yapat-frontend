/**
 * Taxonomy Redux Slice
 * Manages species/taxon search and resolution
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { taxonomyApi, getErrorMessage } from "../../services/api";
import type { TaxonSuggestion, TaxonDetails, Taxonomy } from "../../types";

export interface TaxonomyState {
  suggestions: TaxonSuggestion[];
  searchResults: TaxonDetails[];
  selectedTaxon: TaxonDetails | null;
  taxonomies: Taxonomy[];
  loading: boolean;
  error: string | null;
  lastQuery: string;
}

const initialState: TaxonomyState = {
  suggestions: [],
  taxonomies: [],
  searchResults: [],
  selectedTaxon: null,
  loading: false,
  error: null,
  lastQuery: "",
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Get fast autocomplete suggestions
 * Used for real-time typing in autocomplete
 */
export const getSuggestions = createAsyncThunk(
  "taxonomy/getSuggestions",
  async (params: { query: string; limit?: number }, { rejectWithValue }) => {
    try {
      const { query, limit = 10 } = params;
      return await taxonomyApi.suggest(query, limit);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const getAvailableTaxonomies = createAsyncThunk(
  "taxonomy/available",
  async (_, { rejectWithValue }) => {
    try {
      return await taxonomyApi.available();
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Full-text search with detailed results

export const searchSpecies = createAsyncThunk(
  "taxonomy/search",
  async (
    params: { q: string; limit?: number; rank?: string; status?: string },
    { rejectWithValue },
  ) => {
    try {
      return await taxonomyApi.search(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Resolve a taxon ID to detailed information

export const resolveTaxon = createAsyncThunk(
  "taxonomy/resolve",
  async (taxonId: string, { rejectWithValue }) => {
    try {
      return await taxonomyApi.resolve(taxonId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Fuzzy match a species name

export const matchSpeciesName = createAsyncThunk(
  "taxonomy/match",
  async (name: string, { rejectWithValue }) => {
    try {
      return await taxonomyApi.match(name);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

// ============================================================================
// Slice
// ============================================================================

export const taxonomySlice = createSlice({
  name: "taxonomy",
  initialState,
  reducers: {
    //Clear suggestions

    clearSuggestions: (state) => {
      state.suggestions = [];
    },

    //Clear search results

    clearSearchResults: (state) => {
      state.searchResults = [];
    },

    //Set selected taxon

    setSelectedTaxon: (state, action: PayloadAction<TaxonDetails | null>) => {
      state.selectedTaxon = action.payload;
    },

    //Clear selected taxon

    clearSelectedTaxon: (state) => {
      state.selectedTaxon = null;
    },

    //Clear error message

    clearError: (state) => {
      state.error = null;
    },

    //Reset all taxonomy state

    resetTaxonomy: (state) => {
      state.suggestions = [];
      state.searchResults = [];
      state.selectedTaxon = null;
      state.error = null;
      state.lastQuery = "";
    },
  },
  extraReducers: (builder) => {
    builder
      // Get suggestions
      .addCase(getSuggestions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getSuggestions.fulfilled, (state, action) => {
        state.loading = false;
        state.suggestions = action.payload;
      })
      .addCase(getSuggestions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.suggestions = [];
      })

      //Get available taxonomies
      .addCase(getAvailableTaxonomies.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAvailableTaxonomies.fulfilled, (state, action) => {
        state.loading = false;
        state.taxonomies = action.payload.taxonomies;
      })
      .addCase(getAvailableTaxonomies.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.taxonomies = [];
      })

      // Search species
      .addCase(searchSpecies.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(searchSpecies.fulfilled, (state, action) => {
        state.loading = false;
        state.searchResults = action.payload;
      })
      .addCase(searchSpecies.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.searchResults = [];
      })

      // Resolve taxon
      .addCase(resolveTaxon.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(resolveTaxon.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedTaxon = action.payload;
      })
      .addCase(resolveTaxon.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Match species name
      .addCase(matchSpeciesName.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(matchSpeciesName.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedTaxon = action.payload;
      })
      .addCase(matchSpeciesName.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  clearSuggestions,
  clearSearchResults,
  setSelectedTaxon,
  clearSelectedTaxon,
  clearError,
  resetTaxonomy,
} = taxonomySlice.actions;

export default taxonomySlice.reducer;
