import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderOpenOutlined,
  AudioOutlined,
  BarChartOutlined,
  TagsOutlined,
  TeamOutlined,
  ReadOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { TbArrowUpRight } from "react-icons/tb";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { getLoggedInUser } from "../redux/features/authSlice";
import { canAccessWssed } from "../utils/wssedAccess";
import { openDocs } from "../constants/docs";
import { isStudyMode } from "../studyPhases";

interface ServiceCard {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  route: string;
  external?: boolean;
  color: string;
  bgColor: string;
  borderColor: string;
  /** Border colour of the circular arrow button (light cards). */
  arrowBorder: string;
  badge?: string;
  /** Small secondary line shown at the bottom of the card. */
  footnote?: string;
  roles?: Array<"admin" | "team_owner" | "user">;
  requiresFocalDatasets?: boolean;
}

const CARDS: ServiceCard[] = [
  {
    key: "annotate",
    icon: <AudioOutlined className="text-2xl" />,
    title: "Annotate",
    description:
      "Label audio snippets with random feeds, similarity search, or AI-powered active learning. All modes in one unified workspace.",
    route: "/annotate",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200 hover:border-emerald-400",
    arrowBorder: "border-emerald-200",
    badge: "Core workflow",
    footnote: "Random feed · Similarity search · Active learning",
  },
  {
    key: "datasets",
    icon: <FolderOpenOutlined className="text-2xl" />,
    title: "Dataset Management",
    description:
      "Upload and manage your acoustic recordings. Organise datasets, browse files, and prepare data for annotation.",
    route: "/datasets",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200 hover:border-blue-400",
    arrowBorder: "border-blue-200",
  },
  {
    key: "pre-annotation",
    icon: <TagsOutlined className="text-2xl" />,
    title: "Label Management",
    description:
      "Build and refine your custom label space using the AI taxonomy chatbot. Freeze and publish label sets for your team.",
    route: "/pre-annotation",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200 hover:border-amber-400",
    arrowBorder: "border-amber-200",
  },
  {
    key: "wssed",
    icon: <AudioOutlined className="text-2xl" />,
    title: "WSSED",
    description:
      "Run weakly supervised sound event detection with dataset explorer, training settings, and iterative retraining.",
    route: "/wssed",
    color: "text-cyan-700",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200 hover:border-cyan-400",
    arrowBorder: "border-cyan-200",
    badge: "Training flow",
    requiresFocalDatasets: true,
  },
  {
    key: "teams",
    icon: <TeamOutlined className="text-2xl" />,
    title: "Team Management",
    description:
      "Invite collaborators, manage team roles, and assign datasets. Control access and coordinate annotation efforts.",
    route: "/teams",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200 hover:border-rose-400",
    arrowBorder: "border-rose-200",
    roles: ["admin", "team_owner"],
  },
  {
    key: "study-logs",
    icon: <BarChartOutlined className="text-2xl" />,
    title: "Study Logs",
    description:
      "Browse per-participant interaction events captured during the user study. Inspect sessions, filter by event type, and export CSV.",
    route: "/study-logs",
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200 hover:border-violet-400",
    arrowBorder: "border-violet-200",
    badge: "",
    roles: ["admin"] as Array<"admin" | "team_owner" | "user">,
  },
  {
    key: "documentation",
    icon: <ReadOutlined className="text-2xl" />,
    title: "Documentation",
    description:
      "Step-by-step guides, API references, and best practices for getting the most out of YAPAT.",
    route: "/documentation",
    external: true,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200 hover:border-gray-400",
    arrowBorder: "border-gray-200",
  },
];

/** Static class names so Tailwind can see them. */
const XL_SPAN: Record<number, string> = {
  3: "xl:col-span-3",
  4: "xl:col-span-4",
  6: "xl:col-span-6",
  8: "xl:col-span-8",
  12: "xl:col-span-12",
};

/**
 * Column spans (of a 12-column grid, xl and up) for the visible cards, in
 * order. Every row sums to 12 and the cards fit in two rows, so hiding or
 * adding a service (role, dataset or study-mode rules) never leaves a gap.
 * Annotate is always first and widest. If more cards ever need more than two
 * rows, the extra ones are split as evenly as possible into rows of up to 4.
 *   4 (annotator):  8 4 / 6 6
 *   5 (team owner): 8 4 / 4 4 4
 *   6 (admin):      6 3 3 / 4 4 4
 *   7 (admin+logs): 6 3 3 / 3 3 3 3
 */
function getColumnSpans(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [12];
  const spans = count <= 5 ? [8, 4] : [6, 3, 3];

  let remaining = count - spans.length;
  let rows = Math.ceil(remaining / 4);
  while (rows > 0) {
    const inRow = Math.ceil(remaining / rows);
    spans.push(...Array<number>(inRow).fill(12 / inRow));
    remaining -= inRow;
    rows -= 1;
  }
  return spans;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, accessToken } = useAppSelector((state) => state.auth);
  const { allDatasets } = useAppSelector((state) => state.dataset);

  useEffect(() => {
    if (accessToken && !user) {
      dispatch(getLoggedInUser(accessToken as any));
    }
  }, [accessToken, user, dispatch]);

  useEffect(() => {
    if (!user) return;
    if (
      user.role === "admin" ||
      user.role === "user" ||
      user.role === "team_owner"
    ) {
      dispatch(fetchAllDatasets());
    }
  }, [user, dispatch]);

  const visibleCards = CARDS.filter((card) => {
    if (card.roles && (!user?.role || !card.roles.includes(user.role as any))) {
      return false;
    }
    if (card.requiresFocalDatasets && !canAccessWssed(user, allDatasets)) {
      return false;
    }
    // Study logs only exist on study deployments.
    if (card.key === "study-logs" && !isStudyMode()) {
      return false;
    }
    return true;
  });

  const datasetCount = allDatasets.length;
  const columnSpans = getColumnSpans(visibleCards.length);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />

      {/* Hero / welcome strip */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[85%] mx-auto py-8 px-4 flex flex-row flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 font-ibm-sans mb-1">Hello,</p>
            <h1 className="text-3xl font-bold font-ibm-mono text-gray-900 capitalize">
              {user?.username ?? "…"}
            </h1>
            <p className="text-gray-500 font-ibm-sans mt-1">
              {user?.role === "team_owner"
                ? "Team owner"
                : user?.role === "admin"
                  ? "Administrator"
                  : "Annotator"}
              {" · "}
              <span className="text-blue-600 font-medium">
                {datasetCount} dataset{datasetCount !== 1 ? "s" : ""}
              </span>{" "}
              available
            </p>
          </div>

          {/* Quick-action primary CTA.
              react-audio-spectrogram-player injects an unlayered global
              `button { all: unset; ... }`, which beats Tailwind's layered
              utilities, so this button's utilities are marked important (`!`)
              to scope the fix to this button only. */}
          <button
            onClick={() => navigate("/annotate")}
            className="flex! items-center! justify-center! gap-2! ml-auto! px-6! py-3! bg-gray-900! text-white! text-sm! font-medium! font-ibm-sans! rounded-lg! cursor-pointer! hover:bg-gray-800! transition-colors! focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-blue-500! shrink-0"
          >
            <span>Start Annotating</span>
            <ArrowRightOutlined className="ml-1" />
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="max-w-[85%] mx-auto py-8 px-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 font-ibm-mono mb-5">
          Services
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 auto-rows-fr gap-5">
          {visibleCards.map((card, index) => {
            const isPrimary = card.key === "annotate";
            const openCard = () =>
              card.external ? openDocs() : navigate(card.route);
            return (
              <div
                key={card.key}
                role="link"
                tabIndex={0}
                aria-label={`Open ${card.title}${card.external ? " (opens in a new tab)" : ""}`}
                onClick={openCard}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCard();
                  }
                }}
                className={`
                  group relative flex flex-col rounded-2xl bg-white p-6 cursor-pointer
                  transition-all duration-200
                  hover:shadow-md hover:-translate-y-0.5
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500
                  ${card.borderColor}
                  border ${isPrimary || (index === visibleCards.length - 1 && visibleCards.length % 2 === 0) ? "sm:col-span-2" : ""}
                  ${XL_SPAN[columnSpans[index]] ?? ""}
                `}
              >
                {/* Icon */}
                <div
                  className={`inline-flex items-center justify-center w-11 h-11 rounded-lg mb-4 self-start ${card.bgColor} ${card.color}`}
                >
                  {card.icon}
                </div>

                {/* Badge + arrow (top right) */}
                <div className="absolute top-6 right-6 flex items-center gap-2.5">
                  {card.badge && (
                    <span
                      className="text-fs-10 font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-gray-100 text-gray-500"
                    >
                      {card.badge}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-full border ${card.arrowBorder} ${card.color}`}
                  >
                    <TbArrowUpRight className="text-base transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>

                {/* Content */}
                <h3 className="font-semibold font-ibm-mono mb-2 text-base text-gray-900">
                  {card.title}
                </h3>
                <p className="text-sm font-ibm-sans leading-relaxed text-gray-500">
                  {card.description}
                </p>

                {card.footnote && (
                  <p className="mt-auto pt-4 text-xs font-ibm-sans text-gray-400">
                    {card.footnote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
