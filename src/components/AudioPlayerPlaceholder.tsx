import React, { useEffect } from "react";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import { useAppDispatch } from "../hooks";
import { useSelector } from "react-redux";
import { fetchSnippetAudio } from "../redux/features/snippetSlice";

export const AudioPlayerPlaceholder: React.FC = () => {
  const dispatch = useAppDispatch();
  const { currentSnippetAudio, currentSnippet } = useSelector(
    (state: any) => state.snippet,
  );

  // Fetch audio when snippet changes
  useEffect(() => {
    if (currentSnippet?.id != null) {
      dispatch(fetchSnippetAudio(currentSnippet.id));
    }
  }, [currentSnippet?.id]);

  return (
    <div className="w-full text-center">
      {currentSnippetAudio ? (
        <div className="rounded-md overflow-hidden border border-gray-100 bg-white">
          <SpectrogramPlayer
            key={currentSnippetAudio}
            src={currentSnippetAudio}
            sampleRate={16000}
            specHeight={260}
            navHeight={44}
            dark={false}
            navigator={false} // hide zoom / navigator UI
            settings={false} // settings
            colormap="viridis"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-400">Loading audio…</p>
      )}
    </div>
  );
};
