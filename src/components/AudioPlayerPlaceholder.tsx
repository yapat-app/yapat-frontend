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
    <div className=" from-blue-50 to-indigo-50 rounded-lg p-12 mb-4 text-center border-2 border-dashed border-blue-200">
      {currentSnippetAudio ? (
        <SpectrogramPlayer
          key={currentSnippetAudio}
          src={currentSnippetAudio}
          sampleRate={16000}
          specHeight={250}
          navHeight={60}
          dark={false}
          navigator={false} //  hide zoom / navigator UI
          settings={false} // settings
          colormap="viridis"
        />
      ) : (
        <p className="text-sm text-gray-400">Loading audio…</p>
      )}
    </div>
  );
};
