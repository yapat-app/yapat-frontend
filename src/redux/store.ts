import { configureStore } from "@reduxjs/toolkit";
import { authSlice } from "./features/authSlice";
import { datasetSlice } from "./features/datasetSlice";
import { invitationSlice } from "./features/invitationSlice";
import { teamSlice } from "./features/teamSlice";

const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    dataset: datasetSlice.reducer,
    invitation: invitationSlice.reducer,
    team: teamSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
