export const edgeBundleLimit: number;
export const edgeEntry: string;
export const edgeFunctionDirectory: string;
export const edgeBanner: string;
export function validateEdgeBundle(options: {
  root: string;
  directory: string;
  metafile: { inputs?: Record<string, unknown> } | undefined;
  tracked: string[];
}): { bytes: number; uploadSha256: string };
export function releaseModule(sourceSha: string | undefined): string;
export function bundleEdge(options: {
  root: string;
  entry: string;
  outfile: string;
  external?: string[];
}): Promise<{ inputs: Record<string, unknown> }>;
export function buildEdge(options: {
  root: string;
  directory?: string;
  sourceSha?: string | undefined;
  tracked?: string[];
}): Promise<{ bytes: number; uploadSha256: string }>;
