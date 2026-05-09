import { BlobServiceClient } from "@azure/storage-blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface PrivateObjectStorage {
  read(storageKey: string): Promise<Buffer>;
  write(storageKey: string, data: Buffer | string): Promise<{ byteSize: number; storageKey: string }>;
}

export class LocalPrivateObjectStorage implements PrivateObjectStorage {
  constructor(private readonly rootPath: string) {}

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolve(storageKey));
  }

  async write(storageKey: string, data: Buffer | string): Promise<{ byteSize: number; storageKey: string }> {
    const filePath = this.resolve(storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    await writeFile(filePath, buffer);
    return { byteSize: buffer.byteLength, storageKey };
  }

  private resolve(storageKey: string): string {
    const resolved = path.resolve(this.rootPath, storageKey);
    const root = path.resolve(this.rootPath);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
      throw new Error("Invalid private storage key.");
    }
    return resolved;
  }
}

export class AzureBlobPrivateObjectStorage implements PrivateObjectStorage {
  constructor(
    private readonly connectionString: string,
    private readonly containerName: string,
  ) {}

  async read(storageKey: string): Promise<Buffer> {
    return this.blobClient(storageKey).downloadToBuffer();
  }

  async write(storageKey: string, data: Buffer | string): Promise<{ byteSize: number; storageKey: string }> {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    await this.blobClient(storageKey).uploadData(buffer);
    return { byteSize: buffer.byteLength, storageKey };
  }

  private blobClient(storageKey: string) {
    return BlobServiceClient.fromConnectionString(this.connectionString)
      .getContainerClient(this.containerName)
      .getBlockBlobClient(storageKey);
  }
}

export function createPrivateObjectStorageFromEnv(env: NodeJS.ProcessEnv): PrivateObjectStorage {
  if (env.PRIVATE_STORAGE_DRIVER === "azure_blob") {
    const connectionString = env.AZURE_BLOB_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error("AZURE_BLOB_CONNECTION_STRING is required for Azure Blob private storage.");
    }
    return new AzureBlobPrivateObjectStorage(
      connectionString,
      env.AZURE_BLOB_CONTAINER_NAME ?? "procuredesk-private",
    );
  }
  return new LocalPrivateObjectStorage(env.PRIVATE_STORAGE_ROOT ?? "/var/lib/procuredesk/private");
}
