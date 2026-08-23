let _result: boolean | null = null;

export function isWebGLAvailable(): boolean {
  if (_result !== null) return _result;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const ok = ctx !== null && ctx !== undefined;
    ctx?.getExtension("WEBGL_lose_context")?.loseContext();
    _result = ok;
  } catch {
    _result = false;
  }
  return _result;
}
