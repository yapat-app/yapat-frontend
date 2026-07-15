import React, { useEffect } from "react";
import { useAppDispatch } from "../hooks";
import { useSelector } from "react-redux";
import { fetchSnippetAudio } from "../redux/features/snippetSlice";
import { useSearchParams } from "react-router-dom";
import { SnippetSpectrogramPlayer } from "./SnippetSpectrogramPlayer";
import { useDatasetSpectrogramConfig } from "../hooks/useDatasetSpectrogramConfig";

export const AudioPlayerPlaceholder: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const datasetIdParam = searchParams.get("dataset_id");
  const datasetSpectrogram = useDatasetSpectrogramConfig(datasetIdParam);
  const { currentSnippetAudio, currentSnippet } = useSelector(
    (state: any) => state.snippet,
  );

  useEffect(() => {
    if (currentSnippet?.id != null) {
      dispatch(fetchSnippetAudio(currentSnippet.id));
    }
  }, [currentSnippet?.id, dispatch]);

  return (
    <div className="w-full text-center">
      {currentSnippetAudio ? (
        <div className="shrink-0 rounded-md border border-gray-100 bg-white overflow-x-hidden">
          <SnippetSpectrogramPlayer
            // key={`${currentSnippet?.id ?? "snippet"}|${datasetIdParam ?? ""}`}
            key={`${currentSnippet?.id ?? "snippet"}|${currentSnippetAudio.url}|${datasetIdParam ?? ""}`}
            src={currentSnippetAudio.url}
            sampleRate={currentSnippetAudio.sampleRate}
            datasetSpectrogram={datasetSpectrogram}
            durationSec={currentSnippet?.duration}
            specHeight={260}
            navigator={false}
            settings={false}
            dark={false}
            colormap="viridis"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-400">Loading audio…</p>
      )}
    </div>
  );
};
