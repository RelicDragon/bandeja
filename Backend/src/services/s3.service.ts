import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';

export class S3Service {
  private static client: S3Client | null = null;
  private static bucket: string;
  private static cloudFrontDomain: string;

  static initialize() {
    if (!this.client) {
      this.client = new S3Client({
        region: config.aws.region,
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
        },
      });
      this.bucket = config.aws.s3Bucket;
      this.cloudFrontDomain = config.aws.cloudFrontDomain;
    }
  }

  static async uploadFile(
    buffer: Buffer,
    key: string,
    contentType?: string
  ): Promise<string> {
    this.initialize();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    });

    await this.client!.send(command);
    return this.getCloudFrontUrl(key);
  }

  static async deleteFile(key: string): Promise<boolean> {
    try {
      this.initialize();

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client!.send(command);
      return true;
    } catch (error) {
      console.error(`Error deleting file from S3: ${key}`, error);
      return false;
    }
  }

  static getCloudFrontUrl(key: string): string {
    this.initialize();
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    return `${this.cloudFrontDomain}/${cleanKey}`;
  }

  static extractS3Key(url: string): string {
    this.initialize();
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url);
      return urlObj.pathname.startsWith('/') 
        ? urlObj.pathname.substring(1) 
        : urlObj.pathname;
    }
    
    if (url.startsWith('/uploads/')) {
      return url.substring(1);
    }
    
    return url;
  }
}
