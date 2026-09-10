export function errorMessage(error: unknown, fallback = '操作失败，请稍后重试') {
  const message =
    error instanceof Error ? error.message : String(error || fallback);

  if (/importScripts|worker\.min\.js|tesseract|NetworkError/i.test(message)) {
    return '文字识别组件加载失败，请刷新页面后重试。';
  }
  if (/Failed to fetch|Network request failed|Load failed/i.test(message)) {
    return '网络连接异常，请检查连接后重试。';
  }

  return message.replace(/^Error:\s*/i, '').trim() || fallback;
}
