declare module "*scripts/migrate-images.js" {
  interface UploadedImage {
    url: string;
    fileId: string;
  }

  interface MigrationStory {
    _id: unknown;
    userId: unknown;
    image: string;
  }

  interface VerifiedStoryImage {
    image: string;
    imageFileId: string;
    imageWidth: number;
    imageHeight: number;
  }

  export function verifyImage(
    uploaded: UploadedImage,
    story: MigrationStory,
  ): Promise<VerifiedStoryImage>;
}
