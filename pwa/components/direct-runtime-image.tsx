import type { ImgHTMLAttributes } from "react";

export type DirectRuntimeImageProps = ImgHTMLAttributes<HTMLImageElement>;

export function DirectRuntimeImage(props: DirectRuntimeImageProps) {
  // eslint-disable-next-line @next/next/no-img-element -- Blob/Object URLs and expiring signed URLs must render directly without an optimizer fetch.
  return <img {...props} />;
}
