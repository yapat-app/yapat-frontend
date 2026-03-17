import { Route, Routes } from "react-router-dom";
import "./App.css";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { Datasets } from "./pages/Datasets";
import { Teams } from "./pages/Teams";
import { AnnotationWorkflow } from "./pages/AnnotationWorkflow";
import { YapatUserManual } from "./pages/Documentation";
import { FeedHistory } from "./pages/FeedHistory";
import { Taxonomies } from "./pages/Taxonomies";
import { ActiveLearning } from "./pages/ActiveLearning";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/signUp" element={<SignUp />} />
      <Route path="/home" element={<Home />} />
      <Route path="/datasets" element={<Datasets />} />
      <Route path="/teams" element={<Teams />} />
      <Route path="/taxonomy" element={<Taxonomies />} />
      <Route path="/history" element={<FeedHistory />} />
      <Route path="/annotate" element={<AnnotationWorkflow />} />
      <Route path="/active-learning" element={<ActiveLearning />} />
      <Route path="/docs" element={<YapatUserManual />} />
    </Routes>
  );
}

export default App;
