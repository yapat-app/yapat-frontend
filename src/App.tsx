import { Navigate, Route, Routes, useLocation } from "react-router-dom";
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
import { StudyLogsIndex } from "./pages/studyLogs/StudyLogsIndex";
import { StudyLogsUser } from "./pages/studyLogs/StudyLogsUser";
import { StudyLogsSession } from "./pages/studyLogs/StudyLogsSession";
import { StudyPhaseProvider } from "./studyPhases";
import { StudyFlowProvider } from "./studyFlow";
import { LoggerContextBridge } from "./studyLogging";
import AdminOnlyGuard from "./routes/AdminOnlyGuard";
import TeamOwnerRedirect from "./routes/TeamOwnerRedirect";
import WssedAccessGuard from "./routes/WssedAccessGuard";

function RedirectWithSearch({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

function App() {
  return (
    <StudyPhaseProvider>
      <StudyFlowProvider>
        <LoggerContextBridge />
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
          <Route path="/" element={<HomePage />} />
          <Route path="/pre-annotation" element={<Taxonomies />} />
          <Route path="/history" element={<FeedHistory />} />
          <Route path="/annotate" element={<AnnotationHub />} />
          {/* Legacy routes — redirect to the unified hub */}
          <Route
            path="/v2AnnotationHub"
            element={<RedirectWithSearch to="/annotate" />}
          />
          <Route
            path="/active-learning"
            element={<Navigate to="/annotate" replace />}
          />
          <Route
            path="/wssed"
            element={
              <WssedAccessGuard>
                <Wssed />
              </WssedAccessGuard>
            }
          />
          <Route path="/documentation" element={<YapatUserManual />} />
          {/* Admin-only study log viewer */}
          <Route
            path="/study-logs"
            element={
              <AdminOnlyGuard>
                <StudyLogsIndex />
              </AdminOnlyGuard>
            }
          />
          <Route
            path="/study-logs/:userId"
            element={
              <AdminOnlyGuard>
                <StudyLogsUser />
              </AdminOnlyGuard>
            }
          />
          <Route
            path="/study-logs/:userId/:sessionId"
            element={
              <AdminOnlyGuard>
                <StudyLogsSession />
              </AdminOnlyGuard>
            }
          />
        </Routes>
      </StudyFlowProvider>
    </StudyPhaseProvider>
  );
}

export default App;
