import React, { useEffect } from "react";
import { useAppDispatch } from "../hooks";
import { useSelector } from "react-redux";
import { fetchSnippetAudio } from "../redux/features/snippetSlice";
import { SnippetSpectrogramPlayer } from "./SnippetSpectrogramPlayer";

export const AudioPlayerPlaceholder: React.FC = () => {
  const dispatch = useAppDispatch();
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
        <div className="rounded-md overflow-hidden border border-gray-100 bg-white">
          <SnippetSpectrogramPlayer
            key={currentSnippetAudio.url}
            src={currentSnippetAudio.url}
            sampleRate={currentSnippetAudio.sampleRate}
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
