/**
 * Custom Taxonomy Redux Slice
 * Ask for taxonomy suggestion and add them to the taxonomy list
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getErrorMessage, customtaxonomyApi } from "../../services/api";
import type { Conversation, LabelSpaceItem } from "../../types";

export interface CustomTaxonomyState {
  conversation: Conversation | null;
  labelSpace: LabelSpaceItem[] | [];
  allTaxonomies: any[] | [];
  messageSent: boolean;
  conversationFreezed: boolean;
  labelRemoved: boolean;
  messageLoading: boolean;
  labelAdded: boolean;
  /** True when last add succeeded but all items were already in label space (duplicates) */
  lastAddWasDuplicates: boolean;
  loading: boolean;
  error: string | null;
  lastQuery: string;
}

const initialState: CustomTaxonomyState = {
  conversation: null,
  messageSent: false,
  messageLoading: false,
  conversationFreezed: false,
  labelRemoved: false,
  allTaxonomies: [],
  labelSpace: [],
  labelAdded: false,
  lastAddWasDuplicates: false,
  loading: false,
  error: null,
  lastQuery: "",
};

// ============================================================================
// Async Thunks
// ============================================================================

//Start a new conversation
export const startNewConversation = createAsyncThunk(
  "taxonomy/startConversation",
  async (teamId: number, { rejectWithValue }) => {
    try {
      return await customtaxonomyApi.startConversation(teamId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Cancel conversation
export const cancelConversation = createAsyncThunk(
  "taxonomy/cancelConversation",
  async (conversationId: number, { rejectWithValue }) => {
    try {
      return await customtaxonomyApi.cancelConversation(conversationId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Get conversation
export const getConversation = createAsyncThunk(
  "taxonomy/getConversation",
  async (conversationId: number, { rejectWithValue }) => {
    try {
      return await customtaxonomyApi.getConversation(conversationId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Freeze Conversation
export const freezeConversation = createAsyncThunk(
  "taxonomy/freezeConversation",
  async (
    params: {
      name: string;
      description: string;
      conversationId: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await customtaxonomyApi.freeze(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Get label Space
export const getLabelSpace = createAsyncThunk(
  "taxonomy/getLabelSpace",
  async (conversationId: number, { rejectWithValue }) => {
    try {
      return await customtaxonomyApi.getLabelSpace(conversationId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const sendMessage = createAsyncThunk(
  "taxonomy/sendMessage",
  async (
    params: {
      conversationId: number;
      prompt: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await customtaxonomyApi.sendNewMessage(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Add Labels
export const addLabels = createAsyncThunk(
  "taxonomy/addLabels",
  async (
    params: {
      conversationId: number;
      messageId: number;
      indices: number[];
    },
    { rejectWithValue },
  ) => {
    try {
      return await customtaxonomyApi.addToLabelSpace(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Remove Label
export const removeLabels = createAsyncThunk(
  "taxonomy/removeLabel",
  async (
    params: {
      conversationId: number;
      itemId: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await customtaxonomyApi.removeItem(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const getAllTaxonomies = createAsyncThunk(
  "taxonomy/getAllTaxonomies",
  async (teamId: number, { rejectWithValue }) => {
    try {
      return await customtaxonomyApi.allTaxonomies(teamId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

// ============================================================================
// Slice
// ============================================================================

export const customtaxonomySlice = createSlice({
  name: "customTaxonomy",
  initialState,
  reducers: {
    resetAddLabel: (state) => {
      state.labelAdded = false;
      state.lastAddWasDuplicates = false;
    },
    resetSentMessage: (state) => {
      state.messageSent = false;
    },
    reset: (state) => {
      state.conversationFreezed = false;
      state.labelRemoved = false;
    },
    setLabelSpace: (state, action) => {
      state.labelSpace = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      //start conversation
      .addCase(startNewConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(startNewConversation.fulfilled, (state, action) => {
        state.loading = false;
        state.conversation = action.payload;
      })
      .addCase(startNewConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.conversation = null;
      })
      //cancel conversation
      .addCase(cancelConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelConversation.fulfilled, (state, action) => {
        state.loading = false;
        state.conversation = action.payload;
      })
      //get Conversation
      .addCase(getConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getConversation.fulfilled, (state, action) => {
        state.loading = false;
        state.conversation = action.payload;
        if (Array.isArray(action.payload.label_space)) {
          state.labelSpace = action.payload.label_space;
        }
      })
      //get Label space for conversation
      .addCase(getLabelSpace.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getLabelSpace.fulfilled, (state, action) => {
        state.loading = false;
        if (Array.isArray(action.payload.items)) {
          state.labelSpace = action.payload.items;
        }
      })
      //get all taxonomies for team
      .addCase(getAllTaxonomies.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllTaxonomies.fulfilled, (state, action) => {
        state.loading = false;
        state.allTaxonomies = action.payload.taxonomies;
      })
      //freeze Conversation
      .addCase(freezeConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(freezeConversation.fulfilled, (state, action) => {
        state.loading = false;
        state.conversationFreezed = true;
        if (action.payload?.conversation) {
          state.conversation = action.payload.conversation;
        }
      })
      //send Message
      .addCase(sendMessage.pending, (state) => {
        state.messageLoading = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state) => {
        state.messageLoading = false;
        state.messageSent = true;
      })
      .addCase(sendMessage.rejected, (state, { payload }) => {
        state.messageLoading = false;
        state.error = payload as string;
        state.labelAdded = false;
      })
      //add labels
      .addCase(addLabels.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addLabels.fulfilled, (state, action) => {
        state.loading = false;
        // Add API returns { conversation, added_items, skipped_count } — use conversation.label_space
        const nextLabelSpace = action.payload.conversation?.label_space;
        state.labelSpace = Array.isArray(nextLabelSpace) ? nextLabelSpace : state.labelSpace;
        state.labelAdded = true;
        state.lastAddWasDuplicates = (action.payload.added_items?.length ?? 0) === 0;
      })
      .addCase(addLabels.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.labelAdded = false;
      })
      //remove label
      .addCase(removeLabels.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(removeLabels.fulfilled, (state) => {
        state.loading = false;
        state.labelRemoved = true;
      })
      .addCase(removeLabels.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload as string;
        state.labelRemoved = false;
      });
  },
});

export const { resetAddLabel, resetSentMessage, reset, setLabelSpace } =
  customtaxonomySlice.actions;
export default customtaxonomySlice.reducer;
