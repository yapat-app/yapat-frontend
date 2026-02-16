import { NavigationBar } from "../components/NavigationBar";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card } from "antd";

export const Taxonomies = () => {
  return (
    <div>
      <NavigationBar />
      <div className="w-full flex pt-10 justify-center ">
        <Card className="my-10  w-[80%] h-[80vh] ">
          <div className="flex gap-4 w-full h-[75vh] ">
            <div className="flex w-[60%] h-full">
              <TaxonomyChatbot />
            </div>
            <div className="h-inherit  w-[40%] h-inherit">
              <LabelSpace />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
