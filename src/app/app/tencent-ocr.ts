const endpoint = 'https://ocr.tencentcloudapi.com';
const host = 'ocr.tencentcloudapi.com';
const service = 'ocr';
const version = '2018-11-19';
const action = 'GeneralAccurateOCR';
const algorithm = 'TC3-HMAC-SHA256';
const contentType = 'application/json; charset=utf-8';

const encoder = new TextEncoder();

type TencentOcrTextDetection = {
  DetectedText?: string;
};

type TencentOcrResponse = {
  Response?: {
    Error?: { Code?: string; Message?: string };
    TextDetections?: TencentOcrTextDetection[];
    RequestId?: string;
  };
};

export class TencentOcrError extends Error {
  constructor(
    message: string,
    public readonly code = '',
    public readonly requestId = '',
  ) {
    super(message);
  }
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmac(key: ArrayBuffer, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

function utcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export async function signedTencentOcrHeaders(
  payload: string,
  secretId: string,
  secretKey: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const date = utcDate(timestamp);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    await sha256(payload),
  ].join('\n');
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');
  const secretDate = await hmac(
    encoder.encode(`TC3${secretKey}`).buffer as ArrayBuffer,
    date,
  );
  const secretService = await hmac(secretDate, service);
  const secretSigning = await hmac(secretService, 'tc3_request');
  const signature = hex(await hmac(secretSigning, stringToSign));

  return {
    Authorization:
      `${algorithm} Credential=${secretId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Type': contentType,
    Host: host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
  };
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function recognizeWithTencentOcr(
  bytes: Uint8Array,
  secretId: string,
  secretKey: string,
  isPdf = false,
  pdfPageNumber = 1,
) {
  if (!secretId || !secretKey)
    throw new TencentOcrError('腾讯云文字识别尚未完成服务器配置', 'NotConfigured');
  const payload = JSON.stringify({
    ImageBase64: bytesToBase64(bytes),
    ...(isPdf ? { IsPdf: true, PdfPageNumber: pdfPageNumber } : {}),
  });
  const headers = await signedTencentOcrHeaders(
    payload,
    secretId,
    secretKey,
  );
  const response = await fetch(endpoint, { method: 'POST', headers, body: payload });
  if (!response.ok)
    throw new TencentOcrError('腾讯云文字识别暂时不可用', `HTTP_${response.status}`);
  const body = (await response.json()) as TencentOcrResponse;
  const result = body.Response || {};
  if (result.Error) {
    throw new TencentOcrError(
      result.Error.Message || '腾讯云文字识别失败',
      result.Error.Code || 'TencentCloudError',
      result.RequestId || '',
    );
  }
  const text = (result.TextDetections || [])
    .map((item) => String(item.DetectedText || '').trim())
    .filter(Boolean)
    .join('\n');
  return { text, requestId: result.RequestId || '' };
}

export function pdfPageCount(bytes: Uint8Array) {
  const source = new TextDecoder('latin1').decode(bytes);
  const pageObjects = source.match(/\/Type\s*\/Page\b/g)?.length || 0;
  if (pageObjects) return pageObjects;
  const counts = Array.from(source.matchAll(/\/Count\s+(\d+)/g), (match) =>
    Number(match[1]),
  ).filter((value) => Number.isInteger(value) && value > 0);
  return counts.length ? Math.max(...counts) : 1;
}
