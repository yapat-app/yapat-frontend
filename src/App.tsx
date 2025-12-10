import { Route, Routes } from "react-router-dom";
import "./App.css";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { Datasets } from "./pages/Datasets";
import { Teams } from "./pages/Teams";
import { AnnotationWorkflow } from "./pages/AnnotationWorkflow";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/signUp" element={<SignUp />} />
      <Route path="/home" element={<Home />} />
      <Route path="/datasets" element={<Datasets />} />
      <Route path="/teams" element={<Teams />} />
      <Route path="/annotate" element={<AnnotationWorkflow />} />
    </Routes>
  );
}

export default App;
