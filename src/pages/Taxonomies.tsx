import { NavigationBar } from "../components/NavigationBar";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card, Button } from "antd";
import { useEffect } from "react";
import { fetchAllteams } from "../redux/features/teamSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import { useNavigate } from "react-router-dom";

export const Taxonomies = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { allTeams } = useAppSelector((state) => state.team);
  const firstTeamId: number | undefined = (allTeams as any[])?.[0]?.id;

  useEffect(() => {
    dispatch(fetchAllteams());
  }, []);

  return (
    <div>
      <NavigationBar />
      {allTeams && allTeams.length === 0 ? (
        <div className="w-full flex pt-10 justify-center flex-col items-center">
          <Card
            className="my-4 w-[85%] h-[80vh] flex items-center justify-center"
            bordered={false}
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <div className="flex flex-col items-center justify-center text-center">
              <p className="text-lg font-semibold text-gray-700 mb-2 font-ibm-mono">
                No Teams Found
              </p>

              <p className="text-gray-500 mb-4 max-w-md font-ibm-sans">
                You don’t have any teams yet. Create one to get started with
                collaboration and pre-annotation workflows.
              </p>

              <Button
                type="link"
                className="mt-2"
                onClick={() => navigate("/teams")}
              >
                Go to Teams Page
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="w-full flex pt-10 justify-center flex-col items-center ">
          <h1 className="w-[80%] text-xl font-semibold font-ibm-mono text-gray-800 mb-0 ">
            Pre-Annotation
          </h1>

          <div className="w-[80%] py-2  border-gray-200">
            <p className="sub_description_text">
              Create custom taxonomies and get suggested concepts for your
              annotations—chat below, then add them to your label space.
            </p>
          </div>

          <Card className="my-4 w-[80%] h-[80vh] ">
            <div className="flex gap-4 w-full h-[75vh]">
              <div className="flex w-[85%] h-full">
                {firstTeamId !== undefined && <TaxonomyChatbot teamId={firstTeamId} />}
              </div>

              <div className="w-[40%] h-inherit">
                <LabelSpace />
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
