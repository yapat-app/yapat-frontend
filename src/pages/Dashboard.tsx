import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderOpenOutlined,
  AudioOutlined,
  ThunderboltOutlined,
  TagsOutlined,
  HistoryOutlined,
  TeamOutlined,
  ReadOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets, fetchAllTeamDatasets } from "../redux/features/datasetSlice";
import { getLoggedInUser } from "../redux/features/authSlice";
import { canAccessWssed } from "../utils/wssedAccess";

interface ServiceCard {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  route: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badge?: string;
  roles?: Array<"admin" | "team_owner" | "user">;
  requiresFocalDatasets?: boolean;
}

const CARDS: ServiceCard[] = [
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
  },
  {
    key: "annotate",
    icon: <AudioOutlined className="text-2xl" />,
    title: "Annotate",
    description:
      "Label audio snippets with species names. Work through your annotation queue with AI-powered label suggestions.",
    route: "/annotate",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200 hover:border-emerald-400",
    badge: "Core workflow",
  },
  {
    key: "active-learning",
    icon: <ThunderboltOutlined className="text-2xl" />,
    title: "Active Learning",
    description:
      "Use AI to surface the most informative snippets first. Generate embeddings and smart annotation feeds.",
    route: "/active-learning",
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200 hover:border-violet-400",
    badge: "AI-powered",
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
    badge: "Training flow",
    requiresFocalDatasets: true,
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
  },
  {
    key: "history",
    icon: <HistoryOutlined className="text-2xl" />,
    title: "Feed History",
    description:
      "Browse previously generated annotation feeds. Review progress, re-open completed sessions, and track coverage.",
    route: "/history",
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200 hover:border-slate-400",
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
    roles: ["admin", "team_owner"],
  },
  {
    key: "docs",
    icon: <ReadOutlined className="text-2xl" />,
    title: "Documentation",
    description:
      "Step-by-step guides, API references, and best practices for getting the most out of YAPAT.",
    route: "/docs",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200 hover:border-gray-400",
  },
];

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
    if (user.role === "admin" || user.role === "user") {
      dispatch(fetchAllDatasets());
    } else if (user.role === "team_owner") {
      dispatch(fetchAllTeamDatasets());
    }
  }, [user, dispatch]);

  const visibleCards = CARDS.filter((card) => {
    if (card.roles && (!user?.role || !card.roles.includes(user.role as any))) {
      return false;
    }
    if (card.requiresFocalDatasets && !canAccessWssed(user, allDatasets)) {
      return false;
    }
    return true;
  });

  const datasetCount = allDatasets.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />

      {/* Hero / welcome strip */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[85%] mx-auto py-8 px-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 font-ibm-sans mb-1">
              Hello,
            </p>
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

          {/* Quick-action primary CTA */}
          <button
            onClick={() => navigate("/annotate")}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium font-ibm-sans rounded-lg hover:bg-gray-700 transition-colors shrink-0"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleCards.map((card) => (
            <div
              key={card.key}
              onClick={() => navigate(card.route)}
              className={`
                group relative bg-white rounded-xl border-2 ${card.borderColor}
                p-6 cursor-pointer
                transition-all duration-200
                hover:shadow-md hover:-translate-y-0.5
              `}
            >
              {/* Badge */}
              {card.badge && (
                <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {card.badge}
                </span>
              )}

              {/* Icon */}
              <div
                className={`inline-flex items-center justify-center w-11 h-11 rounded-lg ${card.bgColor} ${card.color} mb-4`}
              >
                {card.icon}
              </div>

              {/* Content */}
              <h3 className="text-base font-semibold font-ibm-mono text-gray-900 mb-2">
                {card.title}
              </h3>
              <p className="text-sm text-gray-500 font-ibm-sans leading-relaxed">
                {card.description}
              </p>

              {/* Footer link */}
              <div
                className={`flex items-center gap-1 mt-4 text-xs font-medium ${card.color} opacity-0 group-hover:opacity-100 transition-opacity`}
              >
                Open <ArrowRightOutlined className="text-[10px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
