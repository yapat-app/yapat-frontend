import { Collapse, Tooltip } from "antd";
import { FolderOpenOutlined, AudioOutlined } from "@ant-design/icons";

const { Panel } = Collapse;

type AudioFile = {
  location: string;
};

type DataFolder = {
  folderName: string;
  audioFiles: AudioFile[];
};

interface DatasetFolderStructureProps {
  onChangeSpecies: (species: string) => void;
  selectedSpecies: string | null;
  dataFolder: DataFolder[];
}

export const DatasetFolderStructure: React.FC<DatasetFolderStructureProps> = ({
  onChangeSpecies,
  selectedSpecies,
  dataFolder,
}) => {
  return (
    <div>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-2">
        <Collapse
          accordion
          ghost
          expandIconPosition="end"
          className="bg-transparent"
        >
          {dataFolder.map((folder, index) => (
            <Panel
              key={index}
              header={
                <div
                  onClick={() => onChangeSpecies(folder.folderName)}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <FolderOpenOutlined className="text-blue-500" />
                  <span
                    className={`truncate rounded-lg transition-all duration-200 cursor-pointer ${
                      selectedSpecies === folder.folderName
                        ? "font-semibold text-blue-900"
                        : "font-normal"
                    }`}
                  >
                    {folder.folderName}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {folder.audioFiles.length}
                  </span>
                </div>
              }
            >
              <div className="pl-2 space-y-1">
                {folder.audioFiles.map((file, i) => (
                  <Tooltip title={file.location} key={i}>
                    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer">
                      <AudioOutlined className="text-green-600 text-xs" />
                      <span className="text-xs text-gray-700 truncate">
                        {file.location}
                      </span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </Panel>
          ))}
        </Collapse>
      </div>
    </div>
  );
};
