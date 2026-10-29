// Shims for checking Deno-style Edge Function sources with the repo's tsc:
// `npm:` specifiers are runtime-provided by Deno, and `Deno` is a global there.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module 'npm:@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
}

declare module 'npm:@aws-sdk/client-s3@3' {
  export class S3Client {
    constructor(args?: any);
    send(command: any): Promise<any>;
  }
  export class DeleteObjectCommand { constructor(args: any); }
  export class DeleteObjectsCommand { constructor(args: any); }
  export class GetObjectCommand { constructor(args: any); }
  export class ListObjectsV2Command { constructor(args: any); }
  export class PutObjectCommand { constructor(args: any); }
}

declare module 'npm:@aws-sdk/s3-request-presigner@3' {
  export function getSignedUrl(client: any, command: any, options?: any): Promise<string>;
}
