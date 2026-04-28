import React from "react";
import { Tabs, Collapse, Typography } from "antd";
import "../styles/docs.css";
import { HomeNavbar } from "../components/HomeNavbar";
import { useAppSelector } from "../hooks";
import { NavigationBar } from "../components/NavigationBar";

const { Paragraph } = Typography;
const { Panel } = Collapse;

/* ----------------------------------
 Types
-----------------------------------*/

export type ManualSection = {
  id: string;
  title: string;
  icon?: React.ReactNode;
  description?: string;
  content?: React.ReactNode;
};

export type ManualTab = {
  id: string;
  label: string;
  sections: ManualSection[];
};

export type YapatUserManualProps = {
  title?: string;
  subtitle?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
};

/* ----------------------------------
 Documentation Structure (EDIT HERE)
-----------------------------------*/

const MANUAL_TABS: ManualTab[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    sections: [
      {
        id: "intro",
        icon: "📘",
        title: "What is YAPAT?",
        description:
          "YAPAT is a lightweight, human-in-the-loop system for the expert annotation of Passive Acoustic Monitoring (PAM) data. It provides an efficient workflow for exploring, labeling, and managing large audio datasets used in biodiversity monitoring and eco-acoustic research.",
      },
      {
        id: "quick-start",
        icon: "⚡",
        title: "Quick Start Guide",
        description: "Get up and running with YAPAT in just a few steps.",
        content: (
          <ol>
            <li>Upload a dataset</li>
            <li>
              Choose a feed method from the available options (e.g. random,
              similarity-based, etc.)
            </li>
            <li>
              Compute embeddings for the dataset if required by the selected
              feed method
            </li>
            <li>Start annotating using the generated feed</li>
          </ol>
        ),
      },
    ],
  },
  {
    id: "datasets",
    label: "Datasets",
    sections: [
      {
        id: "dataset-management",
        icon: "🗂️",
        title: "Dataset Management",
        description:
          "Upload, organize, and manage large PAM datasets efficiently.",
        content: (
          <>
            <p>
              The <strong>Datasets</strong> screen provides an overview of all
              datasets uploaded to your workspace. Each dataset is listed with a
              concise summary of its current annotation progress, allowing you
              to quickly assess how much of the data has already been reviewed.
            </p>
            <br />
            <p>
              From this view, you can monitor the annotation status of the
              currently generated feed and identify datasets that require
              further annotation or processing.
            </p>
            <br />
            <p>
              Each dataset also includes a <strong>Generate Feed</strong>{" "}
              action. This allows you to create a new annotation feed using one
              of the available feed strategies (such as random or
              similarity-based sampling). When required by the selected feed
              method, embeddings can be computed as part of this process.
            </p>
            <br />
            <p>
              Generating a new feed enables you to focus annotation effort on
              the most relevant portions of your data, supporting an efficient
              and iterative annotation workflow.
            </p>
          </>
        ),
      },
      //   {
      //     id: "snippets",
      //     icon: "🎧",
      //     title: "Audio Snippets",
      //     description:
      //       "Automatically generate and navigate audio snippets for annotation.",
      //   },
    ],
  },
  {
    id: "annotation",
    label: "Annotation",
    sections: [
      {
        id: "annotation-overview",
        icon: "✏️",
        title: "Annotation Screen",
        description:
          "Annotate audio snippets using spectrogram visualizations and species labels.",
        content: (
          <>
            <p>
              The <strong>Annotation</strong> screen is the primary workspace
              for labeling audio snippets generated from a dataset feed. Each
              annotation session is tied to a specific dataset and feed
              configuration.
            </p>
            <br />
            <p>
              At the top of the screen, a summary panel provides an overview of
              the current annotation progress, including the total number of
              snippets in the feed, the current snippet position, the number of
              annotated snippets, and the remaining snippets yet to be reviewed.
            </p>
            <br />
            <p>
              The total number of snippets shown here is determined at the time
              of feed generation. Different feed strategies may result in
              different snippet counts depending on the selected parameters.
            </p>
            <br />
            <p>
              The central area displays the currently active audio snippet. Each
              snippet includes metadata such as the snippet index, recording ID,
              and time range. A spectrogram visualization is provided to support
              visual inspection of acoustic patterns, alongside an integrated
              audio player that allows you to listen to the snippet.
            </p>
            <br />
            <p>
              Using the audio controls, you can play, pause, and scrub through
              the snippet to better identify acoustic events before assigning
              labels.
            </p>
            <br />
            <p>
              Navigation controls allow you to move sequentially through the
              feed using <strong>Previous</strong> and <strong>Next</strong>{" "}
              actions. You can add annotations to the current snippet using the
              <strong> Add Annotation </strong> button once you have identified
              the relevant labels.
            </p>
            <br />
            <p>
              Below the main annotation area, the <strong>Snippet Queue</strong>{" "}
              provides a compact overview of snippets in the current feed. This
              queue allows for quick, non-linear navigation between snippets,
              enabling you to jump directly to a specific snippet without
              stepping through the feed sequentially.
            </p>
            <br />
            <p>
              A progress indicator reflects the overall annotation completion
              status, helping you track progress and estimate remaining
              annotation effort during a session.
            </p>
          </>
        ),
      },

      //   {
      //     id: "snippets",
      //     icon: "🎧",
      //     title: "Audio Snippets",
      //     description:
      //       "Automatically generate and navigate audio snippets for annotation.",
      //   },
    ],
  },
];

/* ----------------------------------
 Component
-----------------------------------*/

export const YapatUserManual: React.FC<YapatUserManualProps> = ({
  title = "User Manual",
  subtitle = "A complete guide to using YAPAT for PAM dataset management, AI-assisted annotation, and eco-acoustic analysis.",
}) => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  return (
    <div>
      {isAuthenticated ? <NavigationBar /> : <HomeNavbar />}

      <section className="yapat-manual">
        {/* Header */}

        <header className="yapat-manual__header">
          <h1 className="text-2xl font-bold font-ibm-mono py-2">📖 {title}</h1>
          <p className="sub_description_text">{subtitle}</p>
        </header>

        {/* Tabs */}
        <Tabs
          defaultActiveKey="getting-started"
          items={MANUAL_TABS.map((tab) => ({
            key: tab.id,
            label: tab.label,
            children: (
              <Collapse accordion>
                {tab.sections.map((section) => (
                  <Panel
                    key={section.id}
                    header={
                      <span>
                        <span
                          style={{ marginRight: 8, fontFamily: "ibm-mono" }}
                        >
                          {section.icon}
                        </span>
                        {section.title}
                      </span>
                    }
                  >
                    {section.description && (
                      <Paragraph className="font-ibm-sans">
                        {section.description}
                      </Paragraph>
                    )}
                    {section.content}
                  </Panel>
                ))}
              </Collapse>
            ),
          }))}
        />
      </section>
    </div>
  );
};
