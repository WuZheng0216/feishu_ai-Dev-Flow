import { extname } from "node:path";
import { PDFParse } from "pdf-parse";
import type { RequirementAttachment } from "@devflow/shared";

export interface UploadedRequirementAttachment {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

const MAX_EXTRACTED_CHARS = 24_000;
const MAX_PDF_PAGES = 12;

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".text",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml"
]);

export async function parseRequirementAttachments(
  files: UploadedRequirementAttachment[]
): Promise<RequirementAttachment[]> {
  return Promise.all(files.map((file) => parseRequirementAttachment(file)));
}

async function parseRequirementAttachment(file: UploadedRequirementAttachment): Promise<RequirementAttachment> {
  const base = {
    id: crypto.randomUUID(),
    fileName: file.fileName,
    mimeType: file.mimeType || "application/octet-stream",
    sizeBytes: file.buffer.length
  };

  try {
    const extractedText = isPdfFile(file)
      ? await extractPdfText(file.buffer)
      : isTextFile(file)
        ? extractText(file.buffer)
        : "";

    if (!extractedText.trim()) {
      return {
        ...base,
        extractedText: "",
        summary: "未能从附件中提取可用文本。",
        truncated: false,
        skippedReason: "当前仅支持 PDF 和常见文本类文件。"
      };
    }

    const normalized = normalizeText(extractedText);

    if (!hasMeaningfulExtractedText(normalized)) {
      return {
        ...base,
        extractedText: "",
        summary: "未能从附件中提取可用文本。",
        truncated: false,
        skippedReason: isPdfFile(file)
          ? "PDF 只解析到页码或空白表格，可能是扫描件/图片型 PDF，当前需要 OCR 或模型文档理解。"
          : "附件内容为空或不包含可用文本。"
      };
    }

    const truncated = normalized.length > MAX_EXTRACTED_CHARS;
    const content = truncated ? normalized.slice(0, MAX_EXTRACTED_CHARS) : normalized;

    return {
      ...base,
      extractedText: content,
      summary: summarizeAttachment(content, truncated),
      truncated
    };
  } catch (error) {
    return {
      ...base,
      extractedText: "",
      summary: "附件解析失败。",
      truncated: false,
      skippedReason: error instanceof Error ? error.message : "Unknown parse error"
    };
  }
}

function isPdfFile(file: UploadedRequirementAttachment): boolean {
  return file.mimeType === "application/pdf" || extname(file.fileName).toLowerCase() === ".pdf";
}

function isTextFile(file: UploadedRequirementAttachment): boolean {
  const mimeType = file.mimeType.toLowerCase();
  const extension = extname(file.fileName).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || TEXT_MIME_TYPES.has(mimeType) || TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({
      first: MAX_PDF_PAGES,
      parseHyperlinks: true,
      pageJoiner: "\n\n--- page page_number of total_number ---\n\n"
    });
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function extractText(buffer: Buffer): string {
  if (looksBinary(buffer)) {
    return "";
  }

  return buffer.toString("utf8");
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function hasMeaningfulExtractedText(value: string): boolean {
  const withoutPageMarkers = value
    .replace(/---\s*page\s+\d+\s+of\s+\d+\s*---/gi, "")
    .replace(/\s+/g, "");

  return /[\p{L}\p{N}]/u.test(withoutPageMarkers) && withoutPageMarkers.length >= 12;
}

function summarizeAttachment(content: string, truncated: boolean): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const summary = firstLine
    ? firstLine.length > 90
      ? `${firstLine.slice(0, 90)}...`
      : firstLine
    : "附件已解析为文本。";

  return truncated ? `${summary}（已截断）` : summary;
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  return sample.includes(0);
}
