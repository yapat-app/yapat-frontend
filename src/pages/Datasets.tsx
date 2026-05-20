import { useEffect } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { getAllDatasetAnnotationStats } from "../redux/features/annotationSlice";
import { DatasetCard } from "../components/DatasetCard";
import AddDatasetModal from "../components/AddDatasetModal";
import { clearSnippets } from "../redux/features/snippetSlice";

export const Datasets = () => {
  const dispatch = useAppDispatch();
  const { snippets } = useAppSelector((state: any) => state.snippet);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);
  const { embeddingCreated } = useAppSelector((state) => state.embedding);

  //clear embeddings and snippets flags
  useEffect(() => {
    if (snippets.length > 0) {
      dispatch(clearSnippets());
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (
      user.role === "admin" ||
      user.role === "user" ||
      user.role === "team_owner"
    ) {
      dispatch(fetchAllDatasets());
    }
    dispatch(getAllDatasetAnnotationStats());
  }, [user, embeddingCreated, dispatch]);

  useEffect(() => {}, [allDatasets]);

  return (
    <div>
      <NavigationBar />
      <div className="w-full   h-full flex justify-center">
        <div className="w-[85%]">
          <div className="my-6 ">
            <h1 className="text-2xl font-bold font-ibm-mono">Datasets</h1>
            <p className="sub_description_text">
              Below you can view/ edit all datasets
            </p>
          </div>
          {allDatasets && allDatasets.length > 0 ? (
            <>
              <div id="dataset_list">
                <div className="flex justify-between items-center">
                  <h2 className="card_heading_text">Available Datasets</h2>
                  {user?.role === "admin" && <AddDatasetModal />}
                </div>
                <div className="flex flex-col gap-3 my-8">
                  {allDatasets.map((dataset) => (
                    <DatasetCard key={dataset.id} dataset={dataset} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div id="dataset_list">
              <div className="flex justify-between items-center">
                <h2 className="card_heading_text">Available Datasets</h2>
                {user?.role === "admin" && <AddDatasetModal />}
              </div>
              <div className="flex flex-col items-center justify-center my-8 p-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                <svg
                  className="w-16 h-16 text-gray-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <h3 className="card_heading_text  text-gray-700 mb-2">
                  No Datasets Available
                </h3>
                <p className="text-gray-500 text-center">
                  {user?.role === "admin"
                    ? "There are currently no datasets. Use Add Dataset to register a folder from the data volume."
                    : "There are currently no datasets to display. Contact an administrator to add datasets."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
