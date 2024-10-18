declare module 'pdf-parse' {
    function parse(data: Buffer | ArrayBuffer | Uint8Array): Promise<{
      text: string;
      numpages: number;
      info: any;
      metadata: any;
      version: string;
    }>;
    
    export = parse;
  }