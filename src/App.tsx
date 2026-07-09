import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { Datasets } from "./pages/Datasets";
import { Teams } from "./pages/Teams";
import { ManageTeam } from "./pages/ManageTeam";
import { AnnotationHub } from "./pages/AnnotationHub";
import { YapatUserManual } from "./pages/Documentation";
import { FeedHistory } from "./pages/FeedHistory";
import { Taxonomies } from "./pages/Taxonomies";
import { Wssed } from "./pages/Wssed";
import HomePage from "./pages/HomePage";
import { Dashboard } from "./pages/Dashboard";
import { AdminUsers } from "./pages/AdminUsers";
import { StudyPhaseProvider } from "./studyPhases";
import TeamOwnerRedirect from "./routes/TeamOwnerRedirect";
import WssedAccessGuard from "./routes/WssedAccessGuard";
import AdminRoute from "./routes/AdminRoute";

function App() {
  return (
    <StudyPhaseProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/signUp" element={<SignUp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/datasets" element={<Datasets />} />
        <Route
          path="/teams"
          element={
            <TeamOwnerRedirect>
              <Teams />
            </TeamOwnerRedirect>
          }
        />
        <Route path="/teams/:teamId" element={<ManageTeam />} />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <AdminUsers />
            </AdminRoute>
          }
        />
        <Route path="/" element={<HomePage />} />
        <Route path="/pre-annotation" element={<Taxonomies />} />
        <Route path="/history" element={<FeedHistory />} />
        <Route path="/annotate" element={<AnnotationHub />} />
        {/* Legacy route — redirect to unified hub in AL mode */}
        <Route path="/active-learning" element={<Navigate to="/annotate?mode=al" replace />} />
        <Route
          path="/wssed"
          element={
            <WssedAccessGuard>
              <Wssed />
            </WssedAccessGuard>
          }
        />
        <Route path="/docs" element={<YapatUserManual />} />
      </Routes>
    </StudyPhaseProvider>
  );
}

export default App;
