const jobKey = (datasetId: number) => `wssed:lastTrainingJobId:${datasetId}`;

export function storeWssedTrainingJobId(datasetId: number, jobId: number): void {
  try {
    localStorage.setItem(jobKey(datasetId), String(jobId));
  } catch {
    // ignore quota / private mode
  }
}

export function readWssedTrainingJobId(datasetId: number): number | null {
  try {
    const raw = localStorage.getItem(jobKey(datasetId));
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}
