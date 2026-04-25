import { renderOfflineWav } from "../render/wav-export.js";

export function exportWav(patch, renderOptions = {}) {
  const { wavBytes } = renderOfflineWav(patch, renderOptions);
  const blob = new Blob([wavBytes], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "ghosttone-render.wav";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

