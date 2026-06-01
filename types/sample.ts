export type SampleTaxonomyValue = {
  slug: string;
  label: string;
};

export type PublicSampleAssetUrls = {
  previewAssetUrl: string | null;
  waveformPeaksUrl: string | null;
};

export type SampleCardView = {
  id: string;
  poeticName: string;
  displayTitle: string;
  displayTitleIsCustom: boolean;
  shortDescription: string | null;
  category: SampleTaxonomyValue;
  sampleType: SampleTaxonomyValue;
  moods: SampleTaxonomyValue[];
  bpm: number | null;
  musicalKey: string | null;
  durationSeconds: number | null;
  loopable: boolean;
  featured: boolean;
  previewAssetUrl: string | null;
  waveformPeaksUrl: string | null;
  isFavoritedByCurrentUser: boolean;
};

export type SampleDetailView = SampleCardView & {
  publishedAt: string | null;
};

export type SampleSummary = {
  id: string;
  poeticName: string;
  displayTitle: string;
  displayTitleIsCustom: boolean;
  durationSeconds: number | null;
  previewUrl: string | null;
  waveformPeaksUrl: string | null;
};

export type PublishedSampleSort = "newest" | "oldest" | "title" | "featured" | "duration";

export type PublishedSampleListParams = {
  query?: string | null;
  moodSlug?: string | null;
  categorySlug?: string | null;
  sampleTypeSlug?: string | null;
  loopable?: boolean | null;
  featured?: boolean | null;
  sort?: PublishedSampleSort | null;
  limit?: number | null;
  offset?: number | null;
};

export type PublishedSampleListResult = {
  items: SampleCardView[];
  limit: number;
  offset: number;
  hasMore: boolean;
};
