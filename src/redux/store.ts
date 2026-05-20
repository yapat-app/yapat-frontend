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
import alReducer from "./features/alSlice";
import wssedReducer from "./features/wssedSlice";
import type { PersistedClassicFeedCache } from "../utils/classicFeedPersistence";
import { persistClassicFeedSlotsForUser } from "../utils/classicFeedPersistence";

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
    al: alReducer,
    wssed: wssedReducer,
  },
});

/** After /me hydrates classicFeedCache from localStorage, persist on every change (per user). */
let lastClassicPersistSignature: string | null = null;
store.subscribe(() => {
  const { classicFeedCache, classicFeedCacheUserId } = store.getState().snippet;
  if (classicFeedCacheUserId == null) {
    lastClassicPersistSignature = null;
    return;
  }
  const sig = `${classicFeedCacheUserId}:${JSON.stringify(classicFeedCache)}`;
  if (sig === lastClassicPersistSignature) return;
  lastClassicPersistSignature = sig;
  persistClassicFeedSlotsForUser(
    classicFeedCacheUserId,
    classicFeedCache as unknown as PersistedClassicFeedCache,
  );
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
