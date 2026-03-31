import { configureStore } from "@reduxjs/toolkit";
import { authSlice } from "./features/authSlice";
import { datasetSlice } from "./features/datasetSlice";
import { invitationSlice } from "./features/invitationSlice";
import { teamSlice } from "./features/teamSlice";
import snippetReducer from "./features/snippetSlice";
import annotationReducer from "./features/annotationSlice";
import taxonomyReducer from "./features/taxonomySlice";
import embeddingReducer from "./features/embeddingSlice";
import feedReducer from "./features/feedSlice";
import customTaxonomyReducer from "./features/customTaxonomySlice";

const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    dataset: datasetSlice.reducer,
    invitation: invitationSlice.reducer,
    team: teamSlice.reducer,
    snippet: snippetReducer,
    annotation: annotationReducer,
    taxonomy: taxonomyReducer,
    customTaxonomy: customTaxonomyReducer,
    embedding: embeddingReducer,
    feed: feedReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
