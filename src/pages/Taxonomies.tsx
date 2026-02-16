import { useEffect, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import TaxonomyChatbot from "../components/TaxonomyChatbot";
import { LabelSpace } from "../components/LabelSpace";
import { Card } from "antd";

export const Taxonomies = () => {
  return (
    <div>
      <NavigationBar />
      <div className="w-full flex pt-10 justify-center flex-col items-center">
        <h1 className="w-[80%] text-xl font-semibold text-gray-800 mb-0 pb-2">
          Pre-Annotation
        </h1>
        <div className="w-[80%] py-3 border-b border-gray-200">
          <p className="text-gray-600 text-center text-sm m-0">
            Create custom taxonomies and get suggested concepts for your annotations—chat below, then add them to your label space.
          </p>
        </div>
        <Card className="my-4 w-[80%] h-[80vh] ">
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
