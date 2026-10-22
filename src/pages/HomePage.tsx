import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../hooks";
import { Logo } from "../components/Logo";
import { NavigationBar } from "../components/NavigationBar";
import { navLinkClass } from "../components/navLinkStyles";
import { NavLinkLabel } from "../components/NavLinkLabel";
import {
  FolderOpenOutlined,
  AudioOutlined,
  ThunderboltOutlined,
  TagsOutlined,
  ArrowRightOutlined,
  GithubOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import { openDocs } from "../constants/docs";
import "./HomePage.css";
import { HeroWorkspace } from "../components/home/HeroWorkspace";

const FEATURES = [
  {
    icon: <AudioOutlined className="text-xl" />,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    title: "Expert Annotation",
    desc: "Label PAM snippets with species names in a purpose-built interface, with AI label suggestions built in.",
  },
  {
    icon: <ThunderboltOutlined className="text-xl" />,
    color: "text-violet-600",
    bg: "bg-violet-50",
    title: "Active Learning",
    desc: "The model surfaces the most informative samples first — less annotation effort, better model performance.",
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
    desc: "Build, refine and freeze a curated label set for your soundscape with the AI taxonomy chatbot.",
  },
];

// A global `button { all: unset }` rule (injected by react-audio-spectrogram-
// player) is unlayered and beats Tailwind's layered utilities, so button
// utilities here are marked important (`!`), as on the Dashboard.
const BTN =
  "box-border! inline-flex! items-center! justify-center! gap-2! whitespace-nowrap! rounded-lg! text-sm! font-semibold! cursor-pointer! transition-colors!";
const BTN_PRIMARY = `${BTN} bg-gray-900! text-white! hover:bg-gray-700!`;
const BTN_OUTLINE = `${BTN} border! border-gray-200! bg-white! text-gray-700! hover:border-gray-400! hover:text-gray-900!`;
const BTN_SM = "px-3! py-1.5! sm:px-4! sm:py-2!";
const BTN_LG = "w-full! px-6! py-3! min-[460px]:w-auto!";
const BTN_LINK =
  "font-ibm-mono! cursor-pointer! text-gray-600! transition-colors! hover:text-gray-900!";

// Shared page gutter and content width, so header, sections and footer align.
const CONTAINER = "mx-auto w-full max-w-[1340px] px-5 sm:px-8 lg:px-14";

export const HomePage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  return (
    <div className="flex min-h-screen flex-col bg-white font-ibm-sans text-gray-900 lg:h-dvh lg:min-h-[640px] lg:overflow-hidden">
      {/* ── Navbar ──────────────────────────────────────────────── */}
      {/* Signed in: the app's own NavigationBar, so this page and the dashboard
          share one header (same sizes, fonts and right-hand block). Signed
          out: a bar built the same way, with Sign in where the user and
          logout controls go, so nothing shifts when the state changes. */}
      <header className="sticky top-0 z-50 shrink-0 bg-white">
        {isAuthenticated ? (
          <NavigationBar />
        ) : (
          <div className="nav-zoom flex w-full items-center justify-between border-b border-[#E5E8EB] bg-[#FFFFFF] px-3 max-[359px]:px-2 sm:px-6">
            <h2
              className="cursor-pointer select-none font-ibm-mono text-lg font-bold max-[359px]:text-base transition-opacity hover:opacity-70"
              onClick={() => navigate("/")}
            >
              YAPAT
            </h2>

            <div className="ml-auto flex items-center gap-1 py-1.5 sm:gap-3">
              <nav className="-my-1.5 flex items-center gap-1 self-stretch font-ibm-sans text-sm font-medium">
                <button
                  onClick={openDocs}
                  className={navLinkClass(false)}
                >
                  <NavLinkLabel>Documentation</NavLinkLabel>
                </button>
              </nav>

              <div className="flex items-center gap-2 border-l border-gray-200 pl-2 sm:gap-3 sm:pl-3">
                <span className="hidden sm:block">
                  <Logo />
                </span>
                <button
                  onClick={() => navigate("/login")}
                  className={`${BTN_PRIMARY} ${BTN_SM}`}
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Everything below the header scales up together on very large windows
          (see HomePage.css); the header is left alone so it stays identical to
          the app's navigation bar. */}
      <div className="home-body flex min-h-0 flex-1 flex-col">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        className={`${CONTAINER} grid items-center gap-10 py-12 sm:py-16 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:gap-12 lg:py-[clamp(0.75rem,3vh,2.5rem)]`}
      >
        <div className="min-w-0 max-w-[560px]">
          <span className="mb-5 inline-block lg:mb-[clamp(0.5rem,2vh,1.25rem)] rounded-full border border-gray-200 px-4 py-1.5 font-ibm-mono text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            AI-Powered PAM Annotation
          </span>

          <h1 className="mb-4 font-ibm-mono text-[3.5rem] font-bold leading-none tracking-tight text-gray-900 sm:text-7xl lg:mb-[clamp(0.25rem,1.5vh,1rem)] lg:text-[clamp(3rem,9vh,5.25rem)]">
            YAPAT
          </h1>

          <p className="mb-6 font-ibm-mono text-lg text-gray-600 sm:text-xl lg:mb-[clamp(0.5rem,2.4vh,1.5rem)] lg:text-[clamp(0.9rem,2.5vh,1.25rem)]">
            Yet Another PAM Annotation Tool
          </p>

          <p className="mb-8 max-w-[34rem] text-base leading-relaxed text-gray-600 sm:text-lg lg:mb-[clamp(0.75rem,3vh,2rem)] lg:text-[clamp(0.85rem,2.1vh,1.125rem)]">
            Designed for efficient analysis of passive acoustic monitoring data.
            Active learning prioritises the samples that matter most — so your
            experts spend time where it counts.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {isAuthenticated ? (
              <button
                onClick={() => navigate("/dashboard")}
                className={`${BTN_PRIMARY} ${BTN_LG}`}
              >
                Go to Dashboard <ArrowRightOutlined />
              </button>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className={`${BTN_PRIMARY} ${BTN_LG}`}
              >
                Get started <ArrowRightOutlined />
              </button>
            )}
            <button
              onClick={openDocs}
              className={`${BTN_OUTLINE} ${BTN_LG}`}
            >
              <ReadOutlined /> Read the docs
            </button>
          </div>
        </div>

        <div className="flex min-w-0 justify-start lg:h-full lg:min-h-0 lg:justify-end">
          <HeroWorkspace className="hero-fit" />
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section className="shrink-0 border-t border-gray-200 pb-14 pt-10 sm:pb-16 lg:pb-[clamp(0.75rem,3vh,2rem)] lg:pt-[clamp(0.75rem,3vh,2rem)]">
        <div className={CONTAINER}>
          <h2 className="mb-6 font-ibm-mono text-2xl font-bold tracking-tight text-gray-900 lg:mb-[clamp(0.5rem,2vh,1.25rem)] lg:text-[clamp(1.1rem,2.8vh,1.5rem)]">
            Everything you need
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="relative rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm sm:p-6 lg:p-[clamp(0.75rem,2.2vh,1.5rem)]"
              >
                <span className="absolute right-5 top-5 font-ibm-mono text-xs text-gray-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mb-4 flex items-center gap-3 pr-8 lg:mb-[clamp(0.4rem,1.6vh,1rem)]">
                  <div
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${f.bg} ${f.color}`}
                  >
                    {f.icon}
                  </div>
                  <h3 className="font-ibm-mono font-semibold text-gray-900">
                    {f.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-gray-200 py-8 lg:py-[clamp(0.5rem,2.2vh,2rem)]">
        <div
          className={`${CONTAINER} flex flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left`}
        >
          <div className="flex items-center gap-4">
            <Logo />
            <div className="border-l border-gray-200 pl-4 text-left">
              <div className="font-ibm-mono text-sm font-bold text-gray-900">
                YAPAT
              </div>
              <div className="text-xs text-gray-500">
                Yet Another PAM Annotation Tool
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            © 2026 DFKI — German Research Center for Artificial Intelligence
          </p>

          <div className="flex items-center gap-5 font-ibm-mono text-sm text-gray-600">
            <button
              onClick={openDocs}
              className={BTN_LINK}
            >
              Docs
            </button>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-gray-900"
            >
              <GithubOutlined /> GitHub
            </a>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
};

export default HomePage;
