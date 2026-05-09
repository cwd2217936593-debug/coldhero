/**
 * 服务端 pdfmake 类型补丁
 * --------------------------------
 * 服务端 PdfPrinter 类来自 pdfmake/src/printer，没有官方类型；
 * @types/pdfmake 仅声明浏览器 API 且与服务端 export = 冲突，因此在此最小化自描述。
 */

declare module "pdfmake/interfaces" {
  // 故意宽松：使 PDF 文档定义的字段不强制完整对齐 pdfmake 内部结构
  export type TDocumentDefinitions = Record<string, unknown>;
  export type Content = unknown;
  export type ContentTable = { table: { headerRows?: number; widths?: unknown[]; body: unknown[][] }; layout?: unknown; style?: string; margin?: unknown };
  export type Style = Record<string, unknown>;
  export type TFontDictionary = Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>;
}

declare module "pdfmake" {
  import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

  class PdfPrinter {
    constructor(fontDescriptors: TFontDictionary);
    createPdfKitDocument(
      docDefinition: TDocumentDefinitions,
      options?: Record<string, unknown>,
    ): NodeJS.ReadableStream & {
      on(event: "data", cb: (chunk: Buffer) => void): void;
      on(event: "end", cb: () => void): void;
      on(event: "error", cb: (err: Error) => void): void;
      end(): void;
    };
  }

  export = PdfPrinter;
}
