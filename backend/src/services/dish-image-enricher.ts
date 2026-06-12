type SearchTitleResponse = {
  pages?: Array<{
    key?: string;
    title?: string;
    matched_title?: string | null;
  }>;
};

type ExactPageMatch = {
  key: string;
  title: string;
  matched_title?: string | null;
};

type PageSummaryResponse = {
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
};

type PageImagesResponse = {
  query?: {
    pages?: Array<{
      images?: Array<{
        title?: string;
      }>;
    }>;
  };
};

type ImageInfoResponse = {
  query?: {
    pages?: Array<{
      imageinfo?: Array<{
        url?: string;
      }>;
    }>;
  };
};

const MAX_GALLERY_IMAGES = 3;
const MAX_PAGE_IMAGE_CANDIDATES = 12;
const FETCH_TIMEOUT_MS = 350;
const RASTER_FILE_PATTERN = /\.(jpe?g|png|webp)$/i;
const BANNED_FILE_TOKENS = ["logo", "flag", "symbol", "icon", "map", "ingredient", "ingredients"];

function normalizeTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function normalizeUrl(value: string) {
  return value.startsWith("//") ? `https:${value}` : value;
}

function isUsableRasterFile(fileTitle: string) {
  const normalized = fileTitle.toLowerCase();

  if (!RASTER_FILE_PATTERN.test(normalized)) {
    return false;
  }

  return !BANNED_FILE_TOKENS.some((token) => normalized.includes(token));
}

function uniqueUrls(urls: Array<string | undefined>, primaryImageUrl: string) {
  const seen = new Set([primaryImageUrl]);
  const unique: string[] = [];

  for (const url of urls) {
    if (!url) {
      continue;
    }

    const normalized = normalizeUrl(url);

    if (!/^https?:\/\//i.test(normalized) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

export class DishImageEnricher {
  constructor(
    private readonly restBaseUrl: string,
    private readonly actionApiUrl: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async resolveImageGallery(title: string, primaryImageUrl: string) {
    const page = await this.findExactPage(title);

    if (!page) {
      return [];
    }

    const summaryUrl = `${this.restBaseUrl}/page/summary/${encodeURIComponent(page.key)}`;
    const pageImagesUrl =
      `${this.actionApiUrl}?action=query&titles=${encodeURIComponent(page.title)}` +
      "&prop=images&imlimit=20&format=json&formatversion=2";

    const [summaryResponse, pageImagesResponse] = await Promise.all([
      this.fetchJson<PageSummaryResponse>(summaryUrl),
      this.fetchJson<PageImagesResponse>(pageImagesUrl)
    ]);

    const pageImageTitles =
      pageImagesResponse?.query?.pages?.[0]?.images
        ?.map((image) => image.title)
        .filter((imageTitle): imageTitle is string => Boolean(imageTitle))
        .filter(isUsableRasterFile)
        .slice(0, MAX_PAGE_IMAGE_CANDIDATES) ?? [];

    const imageInfoUrls =
      pageImageTitles.length > 0 ? await this.fetchImageInfoUrls(pageImageTitles) : [];

    return uniqueUrls(
      [
        summaryResponse?.originalimage?.source,
        summaryResponse?.thumbnail?.source,
        ...imageInfoUrls
      ],
      primaryImageUrl
    ).slice(0, MAX_GALLERY_IMAGES);
  }

  private async findExactPage(title: string): Promise<ExactPageMatch | null> {
    const searchUrl = `${this.restBaseUrl}/search/title?q=${encodeURIComponent(title)}&limit=5`;
    const payload = await this.fetchJson<SearchTitleResponse>(searchUrl);
    const target = normalizeTitle(title);

    const page = payload?.pages?.find((candidate) => {
      const candidateTitle = candidate.title ? normalizeTitle(candidate.title) : "";
      const matchedTitle = candidate.matched_title ? normalizeTitle(candidate.matched_title) : "";

      return candidateTitle === target || matchedTitle === target;
    });

    if (!page?.key || !page.title) {
      return null;
    }

    return {
      key: page.key,
      title: page.title,
      matched_title: page.matched_title ?? null
    };
  }

  private async fetchImageInfoUrls(fileTitles: string[]) {
    const imageInfoUrl =
      `${this.actionApiUrl}?action=query&titles=${encodeURIComponent(fileTitles.join("|"))}` +
      "&prop=imageinfo&iiprop=url&format=json&formatversion=2";
    const payload = await this.fetchJson<ImageInfoResponse>(imageInfoUrl);

    return (
      payload?.query?.pages
        ?.map((page) => page.imageinfo?.[0]?.url)
        .filter((url): url is string => Boolean(url)) ?? []
    );
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as T;
    } catch {
      return null;
    }
  }
}
