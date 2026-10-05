import { BadGatewayException } from '@nestjs/common';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta';
const runFile = promisify(execFile);
export const VIDEO_SCENES = [
  'A Vietnamese adult presenter opens with a simple outfit styling question. Speak Vietnamese: "Một chiếc sơ mi, mình có thể phối theo nhiều cách."',
  'The same presenter holds the authorized product and shows its appearance without making claims about fabric or fit. Speak Vietnamese: "Đây là mẫu áo mình đang giới thiệu. Hãy xem kỹ hình thật và chi tiết trên trang sản phẩm."',
  'The same presenter demonstrates one casual styling idea and points to the authorized shirt. Speak Vietnamese: "Bạn có thể thử phối áo với quần jean cho trang phục hằng ngày."',
  'The same presenter shows a second styling idea and a neutral call to action. Speak Vietnamese: "Hoặc phối cùng quần tối màu. Nhớ kiểm tra màu, size và giá hiện tại trước khi chọn nhé."',
];
const HOOKS = [
  'Một món đồ, hai cách phối',
  'Gợi ý phối đồ cho ngày thường',
  'Đổi cách phối, đổi cảm giác bộ đồ',
];

function modelName(raw: string, fallback: string) {
  const model = raw || fallback;
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/i.test(model)) throw new Error('Invalid AI model name');
  return model;
}

async function googleJson(url: string, key: string, body?: unknown) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new BadGatewayException(`AI provider returned HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

export async function makeSafeScript(key: string, configuredModel: string, productName: string, category: string) {
  const model = modelName(configuredModel, 'gemini-2.5-flash');
  const result = await googleJson(`${GOOGLE}/models/${model}:generateContent`, key, {
    contents: [{ parts: [{ text: `Choose exactly one hook index (0, 1, or 2) for a Vietnamese fashion video. Product category: ${category}. Product name: ${productName}. Hooks: ${JSON.stringify(HOOKS)}. Return only JSON {"hookIndex":number}. Do not invent product properties.` }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 100 },
  });
  let parsed: any;
  try { parsed = JSON.parse(result?.candidates?.[0]?.content?.parts?.[0]?.text || ''); }
  catch { throw new BadGatewayException('AI returned invalid JSON'); }
  if (!Number.isInteger(parsed.hookIndex) || parsed.hookIndex < 0 || parsed.hookIndex >= HOOKS.length) {
    throw new BadGatewayException('AI returned an invalid hook');
  }
  const hook = HOOKS[parsed.hookIndex];
  // Only fixed, verifiable phrases enter the spoken line. The model cannot
  // inject claims about fabric, personal use, price or stock into the video.
  const spoken = 'Mình gợi ý phối món đồ này theo cách bạn thích. Xem màu, size và giá hiện tại tại sản phẩm nhé.';
  return {
    script: `${hook}. ${spoken}`,
    caption: `${productName} | Xem màu, size và giá hiện tại trên trang sản phẩm. #thoitrang #phoidovietnam #tiktokshop`,
    shotList: ['Người dẫn giới thiệu cách phối', 'Đối chiếu hình sản phẩm được phép sử dụng', 'Nhắc người xem kiểm tra trang sản phẩm'],
    spoken,
    model,
  };
}

export async function readReferenceImage(sku: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(sku)) throw new Error('Invalid SKU for image');
  const root = process.env.VIDEO_STORAGE_DIR || '/app/storage';
  for (const suffix of ['.png', '.jpg', '.jpeg']) {
    const path = join(root, 'images', `${sku}${suffix}`);
    let info;
    try { info = await stat(path); } catch { continue; }
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Reference image must be a file under 10 MiB');
    const data = await readFile(path);
    return { data: data.toString('base64'), mime: extname(path) === '.png' ? 'image/png' : 'image/jpeg' };
  }
  return undefined;
}

export async function startVeo(key: string, configuredModel: string, prompt: string, reference: { data: string; mime: string }) {
  const model = modelName(configuredModel, 'veo-3.1-fast-generate-preview');
  const data = await googleJson(`${GOOGLE}/models/${model}:predictLongRunning`, key, {
    instances: [{ prompt, referenceImages: [{ image: { inlineData: { mimeType: reference.mime, data: reference.data } }, referenceType: 'asset' }] }],
    parameters: { aspectRatio: '9:16', durationSeconds: '8', resolution: '720p', personGeneration: 'allow_adult' },
  });
  if (!validOperation(data?.name)) throw new BadGatewayException('AI provider did not return a valid job ID');
  return data.name as string;
}

function validOperation(value: unknown): value is string {
  return typeof value === 'string' && /^(?:models\/[A-Za-z0-9._-]+\/)?operations\/[A-Za-z0-9_-]+$/.test(value);
}

function checkedGoogleVideoUrl(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password ||
      !(host === 'generativelanguage.googleapis.com' || host.endsWith('.googleusercontent.com'))) {
    throw new BadGatewayException('AI provider returned an unexpected video host');
  }
  return url.href;
}

export async function pollVeo(key: string, operation: string, id: string, scene: number) {
  if (!validOperation(operation) || !/^[a-f0-9]{24}$/i.test(id) || !Number.isInteger(scene) || scene < 0 || scene >= VIDEO_SCENES.length) throw new Error('Invalid video job');
  const result = await googleJson(`${GOOGLE}/${operation}`, key);
  if (!result.done) return { status: 'SUBMITTED' };
  if (result.error) throw new BadGatewayException('AI video generation failed');
  const uri = result?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (typeof uri !== 'string') throw new BadGatewayException('AI returned no video');
  let url = checkedGoogleVideoUrl(uri);
  let bytes: Uint8Array | undefined;
  for (let hop = 0; hop < 3; hop++) {
    const response = await fetch(url, {
      headers: url.startsWith('https://generativelanguage.googleapis.com/') ? { 'x-goog-api-key': key } : {},
      redirect: 'manual', signal: AbortSignal.timeout(180000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new BadGatewayException('Video redirect has no location');
      url = checkedGoogleVideoUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new BadGatewayException(`Video download returned HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') || 0) > 32 * 1024 * 1024) throw new BadGatewayException('Video scene exceeds 32 MiB');
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.length < 1024 || body.length > 32 * 1024 * 1024 || String.fromCharCode(...body.slice(4, 8)) !== 'ftyp') {
      throw new BadGatewayException('Downloaded file is not a valid small MP4');
    }
    bytes = body;
    break;
  }
  if (!bytes) throw new BadGatewayException('Too many video redirects');
  const directory = join(process.env.VIDEO_STORAGE_DIR || '/app/storage', 'videos');
  await mkdir(directory, { recursive: true });
  const finalPath = join(directory, `${id}-${scene}.mp4`);
  const temporary = join(directory, `${id}-${scene}.partial`);
  await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
  await rename(temporary, finalPath);
  return { status: 'SCENE_READY', path: finalPath };
}

export async function assembleThirtySeconds(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('Invalid video ID');
  const directory = join(process.env.VIDEO_STORAGE_DIR || '/app/storage', 'videos');
  const inputs = VIDEO_SCENES.flatMap((_, i) => ['-i', join(directory, `${id}-${i}.mp4`)]);
  const graph = VIDEO_SCENES.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS[v${i}];[${i}:a]asetpts=PTS-STARTPTS[a${i}]`).join(';')
    + ';' + VIDEO_SCENES.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${VIDEO_SCENES.length}:v=1:a=1[v][a]`;
  const temporary = join(directory, `${id}.partial.mp4`);
  const finalPath = join(directory, `${id}.mp4`);
  await runFile('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...inputs,
    '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', '30',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart', temporary], { timeout: 180000, maxBuffer: 1024 * 1024 });
  const { stdout } = await runFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', temporary], { timeout: 10000 });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration < 29.5 || duration > 30.2) throw new Error('Assembled video duration is not 30 seconds');
  await rename(temporary, finalPath);
  return finalPath;
}
