export type BlobAsset = {
  url: string;
  pathname: string;
  contentType?: string;
};

export type RenderJob = {
  id: string;
  status: string;
  runpodJobId?: string;
  model: BlobAsset;
  referenceImage?: BlobAsset | null;
  recipe: Record<string, unknown>;
  outputPrefix: string;
  createdAt: string;
  updatedAt: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
};

