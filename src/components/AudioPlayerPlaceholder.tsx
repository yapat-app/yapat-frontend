/**
 * Audio Player Placeholder Component
 * 
 * Placeholder for audio player functionality
 * In production, this would be replaced with an actual audio player
 */

import React from "react";

export const AudioPlayerPlaceholder: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-12 mb-4 text-center border-2 border-dashed border-blue-200">
      <div className="text-6xl mb-4">🎵</div>
      <p className="text-lg font-medium text-gray-700 mb-2">
        Audio Player (To be Implemented)
      </p>
      <p className="text-sm text-gray-500">
        This would play the audio snippet for annotation
      </p>
    </div>
  );
};

