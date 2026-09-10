'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ErrorNotice from '@/components/error-notice';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { HouseState, fields } from '@/lib/model';
import { actualAreaSummary, recognizedAreaTotal } from '@/lib/property-extras';
import PropertyFieldControl from './property-field-control';
import { newId } from '@/lib/id';
import { errorMessage } from '@/lib/error-message';
import { recognizeStandaloneFloorPlan } from '@/lib/floorplan-ocr';
import {
  LOCATION_DATA,
  LOCATION_DISTRICTS,
  LOCATION_REGIONS,
} from '@/lib/location-data';
import {
  ReviewRow,
  reviewRows,
  applyReview,
  removeReviewRow,
} from '@/lib/batch-review';
export default function BulkReview({
  state,
  busy,
  onSave,
  onReupload,
  onDone,
  ask,
  onMessage,
}: {
  state: HouseState;
  busy: boolean;
  onSave: (s: HouseState) => Promise<boolean>;
  onReupload: (files: FileList) => Promise<HouseState | undefined>;
  onDone: () => void;
  ask: (s: string) => Promise<boolean>;
  onMessage: (s: string) => void;
}) {
  const [rows, setRows] = useState(() => reviewRows(state));
  const [working, setWorking] = useState(false);
  const [group, setGroup] = useState('price');
  const [saveIssue, setSaveIssue] = useState<{
    message: string;
    row: number | null;
  } | null>(null);
  const [operationError, setOperationError] = useState('');
  const reuploadInput = useRef<HTMLInputElement>(null);
  const planInputs = useRef<Array<HTMLInputElement | null>>([]);
  const nameInputs = useRef<Array<HTMLInputElement | null>>([]);
  const disabled = busy || working;
  useEffect(() => {
    if (saveIssue?.row === null || saveIssue?.row === undefined) return;
    const input = nameInputs.current[saveIssue.row];
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus();
  }, [saveIssue]);
  function change(index: number, patch: Partial<ReviewRow>) {
    setSaveIssue(null);
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }
  async function importPhotos(index: number, files: FileList | null) {
    if (!files || disabled) return;
    setWorking(true);
    setOperationError('');
    try {
      const row = rows[index];
      if (!row) return;
      const ids = [...(row.property.photos || [])];
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
      change(index, {
        property: { ...row.property, photos: Array.from(new Set(ids)) },
      });
      onMessage(`第${index + 1}套已添加 ${files.length} 张看房照片。`);
    } catch (e) {
      setOperationError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }
  async function importFloorPlan(index: number, file: File | undefined) {
    if (!file || disabled) return;
    setWorking(true);
    setOperationError('');
    try {
      if (file.size > 12 * 1024 * 1024) throw Error('图片需小于12MB');
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) throw Error('户型图保存失败');
      const { id } = (await response.json()) as { id: string };
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('chi_sim', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
        logger: (m) => {
          if (m.status === 'recognizing text')
            onMessage(`户型图识别中 ${Math.round(m.progress * 100)}%`);
        },
      });
      try {
        const floorPlan = await recognizeStandaloneFloorPlan(worker, file, id);
        const row = rows[index];
        if (!row) return;
        change(index, {
          property: {
            ...row.property,
            images: Array.from(new Set([...row.property.images, id])),
            floorPlan,
          },
        });
        onMessage(
          `第${index + 1}套已识别户型图，修改房间明细后再保存。共识别 ${floorPlan.rooms.length} 项。`,
        );
      } finally {
        await worker.terminate();
      }
    } catch (e) {
      setOperationError(errorMessage(e));
    } finally {
      setWorking(false);
      if (planInputs.current[index]) planInputs.current[index]!.value = '';
    }
  }
  async function saveAll() {
    if (disabled) return;
    setSaveIssue(null);
    setOperationError('');
    setWorking(true);
    try {
      const next = await applyReview(
        state,
        rows.map((row) => ({ ...row, checked: true })),
        true,
        ask,
      );
      if (await onSave(next)) {
        onDone();
      }
    } catch (e) {
      const message = errorMessage(e);
      const missingName = message.match(/^第(\d+)行：请填写小区 \/ 地址$/);
      const row = missingName ? Number(missingName[1]) - 1 : null;
      setSaveIssue({ message, row });
      onMessage('');
    } finally {
      setWorking(false);
    }
  }
  async function reupload(files: FileList | null) {
    if (!files?.length || disabled) return;
    if (
      !(await ask(
        '重新上传会重新识别重复的截图，并替换这些截图尚未保存的核对修改。继续吗？',
      ))
    )
      return;
    setWorking(true);
    setOperationError('');
    try {
      const next = await onReupload(files);
      if (!next) return;
      const previous = new Map(
        state.drafts.map((draft) => [draft.id, JSON.stringify(draft)]),
      );
      const changedDraftIds = new Set(
        next.drafts
          .filter((draft) => previous.get(draft.id) !== JSON.stringify(draft))
          .map((draft) => draft.id),
      );
      const refreshed = reviewRows(next).filter((row) =>
        changedDraftIds.has(row.draftId),
      );
      setRows((current) => [
        ...current.filter((row) => !changedDraftIds.has(row.draftId)),
        ...refreshed,
      ]);
    } finally {
      setWorking(false);
      if (reuploadInput.current) reuploadInput.current.value = '';
    }
  }
  async function removeOne(index: number) {
    const row = rows[index];
    if (!row || disabled) return;
    if (
      !(await ask(
        `删除待审核房源“${row.property.name || '未命名房源'}”？已保存的房源不受影响。`,
      ))
    )
      return;
    setWorking(true);
    setOperationError('');
    try {
      const next = removeReviewRow(state, row);
      if (await onSave(next)) {
        const remaining = rows.filter((_, i) => i !== index);
        setRows(remaining);
        if (!remaining.length) onDone();
      }
    } catch (e) {
      setOperationError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }
  const columns = fields.filter(([k]) =>
    group === 'price'
      ? ['unitPrice'].includes(k)
      : group === 'layout'
        ? ['area', 'layout'].includes(k)
        : group === 'features'
          ? ['floor', 'direction', 'decoration', 'lift'].includes(k)
          : ['region', 'district', 'year', 'note'].includes(k),
  );
  return (
    <section className="bulk-review">
      <div className="review-heading">
        <h1>
          待核对 <span>{rows.length}</span>
        </h1>
      </div>
      <div className="chips">
        {[
          ['price', '价格'],
          ['layout', '户型'],
          ['features', '楼层装修'],
          ['more', '补充资料'],
        ].map(([id, label]) => (
          <Button
            key={id}
            variant={group === id ? 'default' : 'outline'}
            onClick={() => setGroup(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="review-tools review-actions-top">
        <span className="secondary">共 {rows.length} 套待核对房源</span>
        <div className="review-top-buttons">
          <input
            ref={reuploadInput}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => reupload(event.target.files)}
          />
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => reuploadInput.current?.click()}
          >
            重新上传
          </Button>
          <Button disabled={disabled || !rows.length} onClick={saveAll}>
            {working ? '保存中…' : '保存全部'}
          </Button>
        </div>
      </div>
      {saveIssue && (
        <ErrorNotice title="暂未保存">{saveIssue.message}</ErrorNotice>
      )}
      {operationError && <ErrorNotice>{operationError}</ErrorNotice>}
      <div className="data-grid review-grid">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="review-property-name">房源</TableHead>
              {columns.map(([k, l]) => (
                <TableHead key={k}>{l}</TableHead>
              ))}
              <TableHead hidden={group !== 'price'}>总价（万元）</TableHead>
              <TableHead hidden={group !== 'price'}>报价日期</TableHead>
              <TableHead hidden={group !== 'layout'}>实际面积</TableHead>
              <TableHead aria-label="保存操作" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.property.id}>
                <TableCell className="review-property-name" data-label="房源">
                  <Input
                    ref={(element) => {
                      nameInputs.current[i] = element;
                    }}
                    disabled={disabled}
                    aria-label={`第${i + 1}行房源名`}
                    aria-invalid={saveIssue?.row === i || undefined}
                    value={r.property.name}
                    placeholder={`未命名房源 ${i + 1}`}
                    onChange={(e) =>
                      change(i, {
                        property: { ...r.property, name: e.target.value },
                      })
                    }
                  />
                </TableCell>
                {columns.map(([k, l]) => (
                  <TableCell key={k} data-label={l}>
                    {k === 'region' || k === 'district' ? (
                      <select
                        className="location-select"
                        disabled={disabled}
                        aria-label={`第${i + 1}行${l}`}
                        value={r.property[k] || ''}
                        onChange={(e) =>
                          change(i, {
                            property: {
                              ...r.property,
                              [k]: e.target.value,
                              ...(k === 'region' ? { district: '' } : {}),
                            },
                          })
                        }
                      >
                        <option value="">请选择{l}</option>
                        {(k === 'region'
                          ? LOCATION_REGIONS
                          : r.property.region
                            ? LOCATION_DATA[r.property.region] ||
                              LOCATION_DISTRICTS
                            : LOCATION_DISTRICTS
                        ).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <PropertyFieldControl
                        field={k}
                        label={l}
                        disabled={disabled}
                        aria-label={`第${i + 1}行${l}`}
                        value={r.property[k] || ''}
                        onChange={(value) =>
                          change(i, {
                            property: { ...r.property, [k]: value },
                          })
                        }
                      />
                    )}
                  </TableCell>
                ))}
                <TableCell data-label="总价（万元）" hidden={group !== 'price'}>
                  <Input
                    disabled={disabled}
                    aria-label={`第${i + 1}行总价`}
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => change(i, { amount: e.target.value })}
                  />
                </TableCell>
                <TableCell data-label="报价日期" hidden={group !== 'price'}>
                  <Input
                    disabled={disabled}
                    aria-label={`第${i + 1}行报价日期`}
                    type="date"
                    value={r.date}
                    onChange={(e) => change(i, { date: e.target.value })}
                  />
                  <div className="review-photo-section">
                    <label className="upload-label review-photo-upload">
                      上传看房照片
                      <input
                        disabled={disabled}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        onChange={(e) => {
                          importPhotos(i, e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {!!r.property.photos?.length && (
                      <div className="review-photo-list">
                        {r.property.photos.map((id) => (
                          <span key={id}>
                            <a
                              href={`/api/images/${id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={`/api/images/${id}`}
                                alt="看房照片，点击查看大图"
                              />
                            </a>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                change(i, {
                                  property: {
                                    ...r.property,
                                    photos: r.property.photos?.filter(
                                      (photo) => photo !== id,
                                    ),
                                  },
                                })
                              }
                            >
                              删除
                            </Button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell data-label="实际面积" hidden={group !== 'layout'}>
                  <div className="review-actual-area">
                    <Input
                      disabled={disabled}
                      aria-label={`第${i + 1}行实际面积`}
                      inputMode="decimal"
                      placeholder="实际面积（㎡）"
                      readOnly={
                        recognizedAreaTotal(r.property.floorPlan) !== null
                      }
                      value={
                        recognizedAreaTotal(r.property.floorPlan) ??
                        r.property.actualArea ??
                        ''
                      }
                      onChange={(e) =>
                        change(i, {
                          property: {
                            ...r.property,
                            actualArea: e.target.value,
                          },
                        })
                      }
                    />
                    <label className="upload-label review-plan-upload">
                      上传户型图
                      <input
                        ref={(element) => {
                          planInputs.current[i] = element;
                        }}
                        disabled={disabled}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          importFloorPlan(i, event.target.files?.[0])
                        }
                      />
                    </label>
                    {actualAreaSummary(
                      r.property.area,
                      r.property.floorPlan,
                      r.property.actualArea,
                    ) && (
                      <small>
                        实际面积{' '}
                        {
                          actualAreaSummary(
                            r.property.area,
                            r.property.floorPlan,
                            r.property.actualArea,
                          )!.total
                        }
                        ㎡ · 得房率{' '}
                        {actualAreaSummary(
                          r.property.area,
                          r.property.floorPlan,
                          r.property.actualArea,
                        )!.rate ?? '—'}
                        %
                      </small>
                    )}
                  </div>
                  {r.property.floorPlan ? (
                    <details open>
                      <summary>
                        房间面积 · {r.property.floorPlan.rooms.length} 项
                      </summary>
                      {r.property.floorPlan.rooms.map((room, j) => (
                        <div className="room-row" key={room.id}>
                          <Input
                            aria-label={`房间${j + 1}`}
                            value={room.name}
                            onChange={(e) =>
                              change(i, {
                                property: {
                                  ...r.property,
                                  floorPlan: {
                                    ...r.property.floorPlan!,
                                    confirmed: false,
                                    rooms: r.property.floorPlan!.rooms.map(
                                      (v) =>
                                        v.id === room.id
                                          ? { ...v, name: e.target.value }
                                          : v,
                                    ),
                                  },
                                },
                              })
                            }
                          />
                          <Input
                            aria-label={`${room.name}面积`}
                            inputMode="decimal"
                            value={room.area}
                            onChange={(e) =>
                              change(i, {
                                property: {
                                  ...r.property,
                                  floorPlan: {
                                    ...r.property.floorPlan!,
                                    confirmed: false,
                                    rooms: r.property.floorPlan!.rooms.map(
                                      (v) =>
                                        v.id === room.id
                                          ? { ...v, area: e.target.value }
                                          : v,
                                    ),
                                  },
                                },
                              })
                            }
                          />
                          <label>
                            <input
                              type="checkbox"
                              checked={room.included}
                              onChange={(e) =>
                                change(i, {
                                  property: {
                                    ...r.property,
                                    floorPlan: {
                                      ...r.property.floorPlan!,
                                      confirmed: false,
                                      rooms: r.property.floorPlan!.rooms.map(
                                        (v) =>
                                          v.id === room.id
                                            ? {
                                                ...v,
                                                included: e.target.checked,
                                              }
                                            : v,
                                      ),
                                    },
                                  },
                                })
                              }
                            />
                            计入
                          </label>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              change(i, {
                                property: {
                                  ...r.property,
                                  floorPlan: {
                                    ...r.property.floorPlan!,
                                    confirmed: false,
                                    rooms: r.property.floorPlan!.rooms.filter(
                                      (v) => v.id !== room.id,
                                    ),
                                  },
                                },
                              })
                            }
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        onClick={() =>
                          change(i, {
                            property: {
                              ...r.property,
                              floorPlan: {
                                ...r.property.floorPlan!,
                                confirmed: false,
                                rooms: [
                                  ...r.property.floorPlan!.rooms,
                                  {
                                    id: newId(),
                                    name: '',
                                    area: '',
                                    included: true,
                                  },
                                ],
                              },
                            },
                          })
                        }
                      >
                        补充房间
                      </Button>
                    </details>
                  ) : null}
                </TableCell>
                <TableCell className="review-action-cell">
                  <div className="review-row-actions">
                    <div className="review-save-target">
                      <span>保存到</span>
                      <Select
                        disabled={disabled}
                        value={r.target || 'new'}
                        onValueChange={(v) =>
                          change(i, { target: v === 'new' ? '' : String(v) })
                        }
                      >
                        <SelectTrigger aria-label={`第${i + 1}行保存到`}>
                          <SelectValue>
                            {r.target
                              ? state.properties.find((p) => p.id === r.target)
                                  ?.name
                              : '新增房源'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">新增房源</SelectItem>
                          {state.properties
                            .filter((p) => !p.archived)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                补充：{p.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="destructive"
                        disabled={disabled}
                        onClick={() => removeOne(i)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="secondary">
        编辑完所有房源后点击顶部“保存全部”；删除只作用于当前房源。
      </p>
    </section>
  );
}
