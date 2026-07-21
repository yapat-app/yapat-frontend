import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../hooks";
import { logout } from "../redux/features/authSlice";
import { Logo } from "../components/Logo";
import {
  FolderOpenOutlined,
  AudioOutlined,
  ThunderboltOutlined,
  TagsOutlined,
  ArrowRightOutlined,
  GithubOutlined,
  ReadOutlined,
} from "@ant-design/icons";

const FEATURES = [
  {
    icon: <AudioOutlined className="text-xl" />,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    title: "Expert Annotation",
    desc: "Purpose-built interface for labelling passive acoustic monitoring snippets with species names. AI label suggestions built in.",
  },
  {
    icon: <ThunderboltOutlined className="text-xl" />,
    color: "text-violet-600",
    bg: "bg-violet-50",
    title: "Active Learning",
    desc: "Machine learning surfaces the most informative samples first — minimising annotation effort while maximising model performance.",
  },
  {
    icon: <FolderOpenOutlined className="text-xl" />,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Dataset Management",
    desc: "Upload recordings, organise datasets by project or team, and track annotation coverage at a glance.",
  },
  {
    icon: <TagsOutlined className="text-xl" />,
    color: "text-amber-600",
    bg: "bg-amber-50",
    title: "Custom Label Space",
    desc: "Use the AI taxonomy chatbot to build, refine, and freeze a curated label set tailored to your soundscape.",
  },
];

export const HomePage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  return (
    <div className="min-h-screen bg-white font-ibm-sans text-gray-900">
      {/* ── Navbar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="w-full px-8 h-14 flex items-center justify-between">
          <span
            className="text-lg font-bold font-ibm-mono cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => navigate("/")}
          >
            YAPAT
          </span>

          <div className="flex items-center gap-5">
            {/* Tabs (left side of right cluster) */}
            <nav className="flex items-center text-sm font-medium gap-4">
              <button
                onClick={() => navigate("/documentation")}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                Documentation
              </button>
            </nav>

            {/* Actions + logo (far right) */}
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Dashboard →
                  </button>
                  <button
                    onClick={() => {
                      dispatch(logout());
                      navigate("/login");
                    }}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => navigate("/login")}
                  className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Sign in
                </button>
              )}

              <div className="pl-3 border-l border-gray-200">
                <Logo />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <span className="inline-block text-xs font-semibold uppercase tracking-widest text-gray-400 font-ibm-mono mb-6 border border-gray-200 px-3 py-1 rounded-full">
          AI-Powered PAM Annotation
        </span>

        <h1 className="text-5xl md:text-6xl font-bold font-ibm-mono text-gray-900 mb-6 leading-tight">
          YAPAT
        </h1>

        <p className="text-xl text-gray-500 mb-3 font-ibm-mono">
          Yet Another PAM Annotation Tool
        </p>

        <p className="text-base text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
          Designed for efficient analysis of passive acoustic monitoring data.
          Active learning prioritises the samples that matter most — so your
          experts spend time where it counts.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {isAuthenticated ? (
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Go to Dashboard <ArrowRightOutlined />
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Get started <ArrowRightOutlined />
            </button>
          )}
          <button
            onClick={() => navigate("/documentation")}
            className="flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors"
          >
            <ReadOutlined /> Read the docs
          </button>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold font-ibm-mono text-gray-900 mb-3">
              Everything you need
            </h2>
            <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
              A complete toolkit for passive acoustic monitoring data — from raw
              recordings to labelled, export-ready datasets.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow"
              >
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${f.bg} ${f.color} mb-4`}
                >
                  {f.icon}
                </div>
                <h3 className="font-semibold font-ibm-mono text-gray-900 mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-sm font-bold font-ibm-mono text-gray-700">
              YAPAT
            </span>
          </div>

          <p className="text-xs text-gray-400">
            © 2026 Thiago S. Gouvêa · DFKI
          </p>

          <div className="flex items-center gap-4 text-sm text-gray-400">
            <button
              onClick={() => navigate("/documentation")}
              className="hover:text-gray-700 transition-colors"
            >
              Docs
            </button>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              <GithubOutlined /> GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
