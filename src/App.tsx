import { Route, Routes } from "react-router-dom";
import "./App.css";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { Datasets } from "./pages/Datasets";
import { Teams } from "./pages/Teams";
import { ManageTeam } from "./pages/ManageTeam";
import { AnnotationWorkflow } from "./pages/AnnotationWorkflow";
import { YapatUserManual } from "./pages/Documentation";
import { FeedHistory } from "./pages/FeedHistory";
import { Taxonomies } from "./pages/Taxonomies";
import { ActiveLearning } from "./pages/ActiveLearning";
import HomePage from "./pages/HomePage";
import { Dashboard } from "./pages/Dashboard";
import { StudyPhaseProvider } from "./studyPhases";
import TeamOwnerRedirect from "./routes/TeamOwnerRedirect";

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
        <Route path="/" element={<HomePage />} />
        <Route path="/pre-annotation" element={<Taxonomies />} />
        <Route path="/history" element={<FeedHistory />} />
        <Route path="/annotate" element={<AnnotationWorkflow />} />
        <Route path="/active-learning" element={<ActiveLearning />} />
        <Route path="/docs" element={<YapatUserManual />} />
      </Routes>
    </StudyPhaseProvider>
  );
}

export default App;
