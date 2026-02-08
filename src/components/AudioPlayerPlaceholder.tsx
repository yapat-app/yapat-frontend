import React, { useEffect } from "react";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import { useAppDispatch } from "../hooks";
import { useSelector } from "react-redux";
import { fetchSnippetAudio } from "../redux/features/snippetSlice";
import { AnnotationForm } from "./AnnotationForm";
import TaxonomyAssistant from "./TaxonomyAssistant";

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
    <div className=" from-blue-50 to-indigo-50 rounded-lg mb-4 text-center  border-blue-200 ">
      {currentSnippetAudio ? (
        <>
          <SpectrogramPlayer
            key={currentSnippetAudio}
            src={currentSnippetAudio}
            sampleRate={16000}
            specHeight={380}
            navHeight={60}
            dark={false}
            navigator={false} //  hide zoom / navigator UI
            settings={false} // settings
            colormap="viridis"
          />
        </>
      ) : (
        <p className="text-sm text-gray-400">Loading audio…</p>
      )}
      <div className="text-left mt-6">
        {/* {currentSnippet && (
          <AnnotationForm
            snippetId={currentSnippet.id}
            // onSuccess={handleAnnotationSuccess}
          />
        )} */}
        <TaxonomyAssistant />
      </div>
    </div>
  );
};
