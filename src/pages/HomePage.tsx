import { HomeNavBar } from "../components/HomeNavbar";
import { Button, Card } from "antd";
import { IoBookSharp, IoBarChart, IoPricetag } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import DFKI_logo from "../assets/logos/dfki_Logo_digital_black.png";

export const HomePage = () => {
  const navigator = useNavigate();

  const features = [
    {
      icon: IoBarChart,
      title: "Integrated Visualization",
      description:
        "Combines embedding, dimensionality reduction, and clustering techniques for dynamic and intuitive data exploration.",
    },
    {
      icon: IoPricetag,
      title: "Expert Annotation Tools",
      description:
        "Purpose-built annotation interface designed for efficient and accurate labeling of passive acoustic monitoring data.",
    },
  ];

  const steps = [
    {
      number: "1",
      title: "Create a Virtual Environment",
      description:
        "Set up an isolated Python environment for YAPAT dependencies.",
    },
    {
      number: "2",
      title: "Install YAPAT",
      description: "Install YAPAT using pip or from source repository.",
    },
    {
      number: "3",
      title: "Run the Application",
      description: "Start the YAPAT server from your terminal.",
    },
    {
      number: "4",
      title: "Open in Browser",
      description: "Access the application interface in your web browser.",
    },
  ];

  return (
    <div>
      <HomeNavBar />
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-black mb-6 text-balance font-ibm-mono ">
            YAPAT
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-4 font-ibm-mono ">
            AI-Driven PAM Data Annotation & Visualization
          </p>

          <p className="text-lg text-muted-foreground/80 mb-10 max-w-2xl mx-auto text-pretty font-ibm-sans">
            Yet Another PAM Annotation Tool — Designed for efficient analysis of
            PAM data, utilizing machine learning to prioritize samples for
            expert annotation.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={() => navigator("/docs")}
              asChild
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 font-ibm-sans"
            >
              <IoBookSharp className="mr-2 h-5 w-5" />
              Read the Docs
            </Button>
          </div>
        </div>
      </section>
      <section className="py-20 px-6 bg-card">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4 font-ibm-mono ">
              Key Features
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto font-ibm-sans">
              YAPAT provides a comprehensive suite of tools for analyzing and
              annotating passive acoustic monitoring data with AI assistance.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature) => (
              <Card
                title={feature.title}
                key={feature.title}
                className="border-border bg-background hover:shadow-md transition-shadow"
              >
                {feature.description}
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4 font-ibm-mono ">
              Getting Started
            </h2>
            <p className="text-muted-foreground font-ibm-sans">
              Get up and running with YAPAT in just a few simple steps.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((step) => (
              <Card
                key={step.number}
                className="border-border bg-card text-center "
              >
                <div className="mx-auto h-10 w-10 rounded-full bg-[#F7FAFC] font-ibm-mono  text-primary-foreground flex items-center justify-center font-bold text-lg mb-3">
                  {step.number}
                </div>
                {step.title}

                <p className="text-sm font-ibm-sans!">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <footer className="py-12 px-2 border-t  ">
        <div className="container mx-auto w-[90%] ">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-1">
              <div>
                <img className="nav_logo_dfki" src={DFKI_logo}></img>
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-[]">
              © Copyright 2024, Thiago S. Gouvêa.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
