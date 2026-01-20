import { Button, Tooltip } from "antd";
import { useEffect } from "react";
import { useAppDispatch } from "../hooks";
import { getAllDatasetEmbeddings } from "../redux/features/embeddingSlice";

type DatasetEmbeddingProps = {
  datasetId: number;
};

export const GenerateEmbeddings: React.FC<DatasetEmbeddingProps> = ({
  datasetId,
}) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (datasetId) {
      dispatch(getAllDatasetEmbeddings(datasetId));
    }
  }, []);

  return (
    <Tooltip title={"Embeddings already generated"}>
      <Button color="danger" variant="filled" disabled={true}>
        Generate Embeddings
      </Button>
    </Tooltip>
  );
};
