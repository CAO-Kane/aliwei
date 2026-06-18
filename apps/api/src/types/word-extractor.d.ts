declare module "word-extractor" {
  interface WordExtractorBody {
    content(): string;
  }
  interface WordExtractorDocument {
    getBody(): WordExtractorBody;
  }
  class WordExtractor {
    extract(filePath: string): Promise<WordExtractorDocument>;
  }
  export = WordExtractor;
}
