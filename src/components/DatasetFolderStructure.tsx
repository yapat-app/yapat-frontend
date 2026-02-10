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

const dataFolder: DataFolder[] = [
  {
    folderName: "European Robin",
    audioFiles: [
      { location: "ER_20190911_024500.wav" },
      { location: "ER_20190912_061200.wav" },
      { location: "ER_20190913_193000.wav" },
    ],
  },
  {
    folderName: "Common Blackbird",
    audioFiles: [
      { location: "CB_20190821_054300.wav" },
      { location: "CB_20190822_182100.wav" },
    ],
  },
  {
    folderName: "Crow",
    audioFiles: Array.from({ length: 12 }).map((_, i) => ({
      location: `GT_2019100${i + 1}_070000.wav`,
    })),
  },
];

export const DatasetFolderStructure = () => {
  return (
    <aside className="w-[280px] h-inherit border-r border-[#F0F0F0] bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 ">
        <h3 className="text-sm font-semibold text-gray-800">
          Dataset Explorer
        </h3>
        <p className="text-xs text-gray-500">Preview stored audio locations</p>
      </div>

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
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FolderOpenOutlined className="text-blue-500" />
                  <span className="truncate">{folder.folderName}</span>
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
    </aside>
  );
};
