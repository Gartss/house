'use client';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HouseState, Property } from '@/lib/model';
import {
  actualAreaSummary,
  recognizedAreaTotal,
  parseRooms,
  parseCommunityQuote,
  communityForProperty,
} from '@/lib/property-extras';
import { newId } from '@/lib/id';
async function readImage(
  file: File,
  onProgress: (s: string) => void,
  crop?: { left: number; top: number; width: number; height: number },
) {
  if (file.size > 12 * 1024 * 1024) throw Error('图片需小于12MB');
  const response = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw Error('图片保存失败');
  const { id } = (await response.json()) as { id: string };
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('chi_sim', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    logger: (m) => {
      if (m.status === 'recognizing text')
        onProgress(`识别中 ${Math.round(m.progress * 100)}%`);
    },
  });
  let text = '';
  try {
    let source: File | HTMLCanvasElement = file;
    if (crop) {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const w = (bitmap.width * crop.width) / 100,
        h = (bitmap.height * crop.height) / 100;
      const scale = Math.min(3, 2200 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas
        .getContext('2d')!
        .drawImage(
          bitmap,
          (bitmap.width * crop.left) / 100,
          (bitmap.height * crop.top) / 100,
          w,
          h,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      bitmap.close();
      source = canvas;
    }
    text = (await worker.recognize(source)).data.text;
  } catch {
    onProgress('未能识别文字，请对照原图填写。');
  } finally {
    await worker.terminate();
  }
  return { id, text };
}
export default function PropertyExtras({
  property,
  onChange,
  state,
  onSave,
  busy,
  onBusy,
  onMessage,
}: {
  property: Property;
  onChange: (p: Property) => void;
  state: HouseState;
  onSave: (s: HouseState) => Promise<boolean>;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onMessage: (s: string) => void;
}) {
  const [working, setWorking] = useState(false);
  const [quote, setQuote] = useState<{
    image: string;
    text: string;
    amount: string;
    unit: '元/㎡' | '万元';
    kind: string;
    period: string;
  } | null>({
    image: '',
    text: '',
    amount: '',
    unit: '万元',
    kind: '成交价',
    period: '',
  });
  const [crop, setCrop] = useState({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  const fileRef = useRef<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const disabled = busy || working;
  const community = communityForProperty(state, property);
  const plan = property.floorPlan;
  const summary = actualAreaSummary(property.area, plan, property.actualArea);
  async function importFile(
    file: File | undefined,
    type: 'community' | 'plan',
  ) {
    if (!file || disabled) return;
    setWorking(true);
    onBusy(true);
    setLocalError('');
    try {
      const result = await readImage(
        file,
        onMessage,
        type === 'plan' ? crop : undefined,
      );
      if (type === 'plan') {
        fileRef.current = file;
        onChange({
          ...property,
          images: Array.from(new Set([...property.images, result.id])),
          floorPlan: {
            image: result.id,
            text: result.text,
            rooms: parseRooms(result.text),
            confirmed: false,
          },
        });
        onMessage('已识别房间面积，修改明细会实时更新实际面积。');
      } else {
        const parsed = parseCommunityQuote(result.text);
        const imported = {
          image: result.id,
          text: result.text,
          ...parsed,
          amount: parsed.unit === '万元' ? parsed.amount : '',
        };
        if (Number(imported.amount) > 0) {
          await appendQuote(imported);
          onMessage('已识别并添加成交价记录。');
        } else {
          setQuote(imported);
          setLocalError('截图中未识别到成交总价，请补充后点击添加。');
        }
      }
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setWorking(false);
      onBusy(false);
    }
  }
  async function importPhotos(files: FileList | null) {
    if (!files || disabled) return;
    setWorking(true);
    onBusy(true);
    try {
      const ids = [...(property.photos || [])];
      for (const file of Array.from(files)) {
        if (file.size > 12 * 1024 * 1024) throw Error('图片需小于12MB');
        const response = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!response.ok) throw Error('看房照片保存失败');
        ids.push(((await response.json()) as { id: string }).id);
      }
      onChange({ ...property, photos: Array.from(new Set(ids)) });
      onMessage(`已添加 ${files.length} 张看房照片，点击页面顶部“保存”生效。`);
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setWorking(false);
      onBusy(false);
    }
  }
  async function appendQuote(inputQuote = quote) {
    setLocalError('');
    if (
      !inputQuote ||
      !Number.isFinite(Number(inputQuote.amount)) ||
      Number(inputQuote.amount) <= 0 ||
      !inputQuote.amount
    ) {
      setLocalError('请填写有效成交总价');
      return;
    }
    const next = structuredClone(state);
    const target = communityForProperty(next, property);
    const current = target || {
      id: newId(),
      name: property.name.trim(),
      region: property.region || '',
      quotes: [],
    };
    if (!current.name) {
      setLocalError('请先填写小区 / 地址');
      return;
    }
    if (!target) next.communities = [...(next.communities || []), current];
    if (
      current.quotes.some(
        (q) =>
          q.image === inputQuote.image &&
          q.period === inputQuote.period &&
          q.amount === Number(inputQuote.amount),
      )
    ) {
      setLocalError('这条成交记录已保存');
      return;
    }
    current.quotes.push({
      id: newId(),
      image: inputQuote.image,
      amount: Number(inputQuote.amount),
      unit: '万元',
      period: inputQuote.period,
      kind: '成交价',
      createdAt: new Date().toISOString(),
    });
    for (const candidate of next.properties) {
      const sameName =
        candidate.name.trim().replace(/\s/g, '') ===
        property.name.trim().replace(/\s/g, '');
      const sameRegion =
        !candidate.region ||
        !property.region ||
        candidate.region === property.region;
      if (candidate.id === property.id || (sameName && sameRegion))
        candidate.communityId = current.id;
    }
    if (await onSave(next)) {
      onChange({ ...property, communityId: current.id });
      setQuote({
        image: '',
        text: '',
        amount: '',
        unit: '万元',
        kind: '成交价',
        period: '',
      });
    }
  }
  async function deleteQuote(id: string) {
    if (!property.communityId || disabled) return;
    const next = structuredClone(state);
    const target = next.communities?.find((c) => c.id === property.communityId);
    if (!target) return;
    target.quotes = target.quotes.filter((q) => q.id !== id);
    await onSave(next);
  }
  const communityName = community?.name || property.name || '当前小区';
  return (
    <fieldset disabled={disabled} className="extras-fields">
      <section className="panel">
        <h2>小区成交价</h2>
        <p className="secondary">当前小区：{communityName}</p>
        <label className="upload-label">
          导入成交价截图
          <input
            disabled={disabled}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              importFile(e.target.files?.[0], 'community');
              e.target.value = '';
            }}
          />
        </label>
        {quote && (
          <div className="extra-review">
            {quote.image && (
              <img
                className="full-image"
                src={`/api/images/${quote.image}`}
                alt="小区成交价原图"
              />
            )}
            <div className="edit-grid">
              <label>
                成交总价（万元）
                <Input
                  value={quote.amount}
                  inputMode="decimal"
                  onChange={(e) => {
                    setQuote({ ...quote, amount: e.target.value });
                  }}
                />
              </label>
              <label>
                统计时间
                <Input
                  type="date"
                  value={
                    /^\d{4}-\d{2}-\d{2}$/.test(quote.period) ? quote.period : ''
                  }
                  onChange={(e) => {
                    setQuote({ ...quote, period: e.target.value });
                  }}
                />
              </label>
            </div>
            <Button
              disabled={disabled || !quote.amount}
              onClick={() => appendQuote()}
            >
              添加成交记录
            </Button>
          </div>
        )}
        {community?.quotes
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((q) => (
            <div className="quote-row" key={q.id}>
              <div>
                <strong>{q.amount.toLocaleString()} 万元</strong>
                <p>{q.period || '时间待补'}</p>
              </div>
              {q.image && (
                <a
                  href={`/api/images/${q.image}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  原图
                </a>
              )}
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => deleteQuote(q.id)}
              >
                删除
              </Button>
            </div>
          ))}
      </section>
      <section className="panel">
        <h2>看房照片</h2>
        <p className="secondary">可添加现场拍摄照片，与当前房源一起保存。</p>
        <label className="upload-label">
          上传看房照片
          <input
            disabled={disabled}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => {
              importPhotos(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {!!property.photos?.length && (
          <div className="photo-gallery">
            {property.photos.map((id) => (
              <div className="photo-item" key={id}>
                <a
                  href={`/api/images/${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setPreviewPhoto(id);
                  }}
                >
                  <img src={`/api/images/${id}`} alt="看房照片，点击查看大图" />
                </a>
                <Button
                  variant="destructive"
                  onClick={() =>
                    onChange({
                      ...property,
                      photos: property.photos?.filter((photo) => photo !== id),
                    })
                  }
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
      {previewPhoto && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-label="看房照片大图"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="photo-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={`/api/images/${previewPhoto}`} alt="看房照片大图" />
            <Button variant="outline" onClick={() => setPreviewPhoto(null)}>
              关闭
            </Button>
          </div>
        </div>
      )}
      <section className="panel">
        <h2>
          实际面积
          {summary && (
            <span className="area-result">
              {' '}
              {summary.total}㎡{' '}
              <small>
                得房率 {summary.rate === null ? '—' : `${summary.rate}%`}
              </small>
            </span>
          )}
        </h2>
        <label>
          {recognizedAreaTotal(plan) !== null
            ? '实际面积（按计入的房间实时合计）'
            : '手动输入实际面积（㎡）'}
          <Input
            inputMode="decimal"
            readOnly={recognizedAreaTotal(plan) !== null}
            value={recognizedAreaTotal(plan) ?? property.actualArea ?? ''}
            onChange={(e) =>
              onChange({ ...property, actualArea: e.target.value })
            }
          />
        </label>
        <label className="upload-label">
          上传户型图
          <input
            ref={input}
            disabled={disabled}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              importFile(e.target.files?.[0], 'plan');
              e.target.value = '';
            }}
          />
        </label>
        {plan && (
          <>
            <a
              href={`/api/images/${plan.image}`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                className="full-image"
                src={`/api/images/${plan.image}`}
                alt="户型图，点击放大"
              />
            </a>
            <details>
              <summary>只识别户型区域</summary>
              <p className="secondary">
                填写户型区域在整张截图中的位置百分比。
              </p>
              <div className="crop-fields">
                {(['left', 'top', 'width', 'height'] as const).map((k, i) => (
                  <label key={k}>
                    {['左侧', '顶部', '宽度', '高度'][i]} %
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={crop[k]}
                      onChange={(e) =>
                        setCrop({ ...crop, [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <Button
                variant="outline"
                disabled={
                  disabled ||
                  crop.width <= 0 ||
                  crop.height <= 0 ||
                  crop.left < 0 ||
                  crop.top < 0 ||
                  crop.left + crop.width > 100 ||
                  crop.top + crop.height > 100
                }
                onClick={async () => {
                  if (
                    plan.rooms.length &&
                    !window.confirm('重新识别将替换当前房间明细，继续？')
                  )
                    return;
                  try {
                    const file =
                      fileRef.current ||
                      new File(
                        [
                          await (
                            await fetch(`/api/images/${plan.image}`)
                          ).blob(),
                        ],
                        'floorplan.png',
                        { type: 'image/png' },
                      );
                    await importFile(file, 'plan');
                  } catch {
                    setLocalError('无法读取原图');
                  }
                }}
              >
                重新识别区域
              </Button>
            </details>
            {plan.rooms.length === 0 && (
              <p className="secondary">
                未识别到完整房间标注，可调整识别区域或补充房间。
              </p>
            )}
            <div>
              {plan.rooms.map((room, i) => (
                <div className="room-row" key={room.id}>
                  <Input
                    disabled={disabled}
                    aria-label={`房间${i + 1}名称`}
                    value={room.name}
                    placeholder="房间"
                    onChange={(e) =>
                      onChange({
                        ...property,
                        floorPlan: {
                          ...plan,
                          confirmed: false,
                          rooms: plan.rooms.map((r) =>
                            r.id === room.id
                              ? { ...r, name: e.target.value }
                              : r,
                          ),
                        },
                      })
                    }
                  />
                  <Input
                    disabled={disabled}
                    aria-label={`房间${i + 1}面积`}
                    value={room.area}
                    inputMode="decimal"
                    placeholder="㎡"
                    onChange={(e) =>
                      onChange({
                        ...property,
                        floorPlan: {
                          ...plan,
                          confirmed: false,
                          rooms: plan.rooms.map((r) =>
                            r.id === room.id
                              ? { ...r, area: e.target.value }
                              : r,
                          ),
                        },
                      })
                    }
                  />
                  <label>
                    <input
                      disabled={disabled}
                      type="checkbox"
                      checked={room.included}
                      onChange={(e) =>
                        onChange({
                          ...property,
                          floorPlan: {
                            ...plan,
                            confirmed: false,
                            rooms: plan.rooms.map((r) =>
                              r.id === room.id
                                ? { ...r, included: e.target.checked }
                                : r,
                            ),
                          },
                        })
                      }
                    />
                    计入
                  </label>
                  <Button
                    disabled={disabled}
                    variant="ghost"
                    aria-label={`删除房间${i + 1}`}
                    onClick={() =>
                      onChange({
                        ...property,
                        floorPlan: {
                          ...plan,
                          confirmed: false,
                          rooms: plan.rooms.filter((r) => r.id !== room.id),
                        },
                      })
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...property,
                  floorPlan: {
                    ...plan,
                    confirmed: false,
                    rooms: [
                      ...plan.rooms,
                      {
                        id: newId(),
                        name: '',
                        area: '',
                        included: true,
                      },
                    ],
                  },
                })
              }
            >
              添加房间
            </Button>
            <p className="secondary">
              修改房间面积或“计入”状态后，实际面积和得房率会立即更新。
            </p>
          </>
        )}
      </section>
      {localError && (
        <p className="status" role="alert">
          {localError}
        </p>
      )}
    </fieldset>
  );
}
