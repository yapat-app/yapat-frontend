import { NavigationBar } from "../components/NavigationBar";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card } from "antd";
import { useEffect } from "react";
import { fetchAllteams } from "../redux/features/teamSlice";
import { useAppDispatch, useAppSelector } from "../hooks";

export const Taxonomies = () => {
  const dispatch = useAppDispatch();
  const { allTeams } = useAppSelector((state) => state.team);
  const firstTeamId: number | undefined = (allTeams as any[])?.[0]?.id;

  useEffect(() => {
    dispatch(fetchAllteams());
  }, []);

  return (
    <div>
      <NavigationBar />
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
              <TaxonomyChatbot teamId={firstTeamId} />
            </div>

            <div className="w-[40%] h-inherit">
              <LabelSpace />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
