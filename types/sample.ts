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

export type SearchSort =
  | "relevance"
  | "newest"
  | "most_played"
  | "most_downloaded"
  | "most_favorited"
  | "featured"
  | "random_seeded";

export type SearchSource = "web" | "plugin";

export type SearchInput = {
  query?: string | null;
  moods?: string[];
  categories?: string[];
  sampleTypes?: string[];
  bpmMin?: number | null;
  bpmMax?: number | null;
  musicalKey?: string | null;
  loopable?: boolean | null;
  featuredOnly?: boolean;
  albumId?: string | null;
  sort?: SearchSort | null;
  page?: number | null;
  pageSize?: number | null;
  seed?: string | null;
  source?: SearchSource;
};

export type SearchAssetReference = {
  bucket: string;
  objectPath: string;
  publicUrl?: string;
};

export type SearchSampleResult = {
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
  publishedAt: string | null;
  previewAsset: SearchAssetReference | null;
  waveformAsset: SearchAssetReference | null;
  previewAssetUrl: string | null;
  waveformPeaksUrl: string | null;
  stats?: {
    playCount: number;
    downloadCount: number;
    favoriteCount: number;
  };
  score?: number;
  isFavoritedByCurrentUser: boolean;
};

export type SuggestedCategory = SampleTaxonomyValue & {
  weight: number;
  reason: "mood_suggestion";
};

export type SearchResponse = {
  results: SearchSampleResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  normalizedQuery: string | null;
  appliedFilters: SearchInput;
  suggestedCategories?: SuggestedCategory[];
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
