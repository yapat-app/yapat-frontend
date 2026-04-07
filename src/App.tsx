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
import HomePage from "./pages/HomePage";
import TeamOwnerRedirect from "./routes/TeamOwnerRedirect";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signUp" element={<SignUp />} />
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
      <Route path="/docs" element={<YapatUserManual />} />
    </Routes>
  );
}

export default App;
