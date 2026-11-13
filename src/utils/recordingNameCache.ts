/**
 * Things the feed already knows about the snippets around the one on screen,
 * shared with the snippet header: which recording a snippet belongs to, and
 * the file names of recordings that have been looked up. With them the header
 * shows a snippet's file name the moment you move to it, instead of dropping
 * the name while it fetches the snippet and then the recording again.
 */
const names = new Map<number, string>();
const recordingOfSnippet = new Map<number, number>();

export function getSnippetRecording(snippetId: number): number | undefined {
  return recordingOfSnippet.get(snippetId);
}

export function rememberSnippetRecording(
  snippetId: number,
  recordingId: number,
): void {
  recordingOfSnippet.set(snippetId, recordingId);
}

export function getRecordingName(recordingId: number): string | undefined {
  return names.get(recordingId);
}

export function rememberRecordingName(recordingId: number, name: string): void {
  names.set(recordingId, name);
}
