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

/** Persist classic feed cache when it changes (reference + debounce — avoids work on every Redux dispatch). */
let prevClassicCacheRef: unknown = null;
let prevClassicCacheUserId: number | null = null;
let classicPersistTimer: ReturnType<typeof setTimeout> | null = null;

store.subscribe(() => {
  const { classicFeedCache, classicFeedCacheUserId } = store.getState().snippet;
  if (classicFeedCacheUserId == null) {
    prevClassicCacheRef = classicFeedCache;
    prevClassicCacheUserId = null;
    if (classicPersistTimer !== null) {
      window.clearTimeout(classicPersistTimer);
      classicPersistTimer = null;
    }
    return;
  }
  if (
    classicFeedCache === prevClassicCacheRef &&
    classicFeedCacheUserId === prevClassicCacheUserId
  ) {
    return;
  }
  prevClassicCacheRef = classicFeedCache;
  prevClassicCacheUserId = classicFeedCacheUserId;
  if (classicPersistTimer !== null) window.clearTimeout(classicPersistTimer);
  classicPersistTimer = window.setTimeout(() => {
    classicPersistTimer = null;
    const s = store.getState().snippet;
    if (s.classicFeedCacheUserId == null) return;
    persistClassicFeedSlotsForUser(
      s.classicFeedCacheUserId,
      s.classicFeedCache as unknown as PersistedClassicFeedCache,
    );
  }, 400);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
