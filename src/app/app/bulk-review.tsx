'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ErrorNotice from '@/components/error-notice';
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
import { putLocalImage, useLocalImageUrl } from '@/lib/local-store';
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
import {
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Eye,
  Folder,
  Home,
  Image as ImageIcon,
  Layers3,
  Maximize2,
  PaintRoller,
  Plus,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
function LocalReviewImage({ id, plain = false }: { id: string; plain?: boolean }) {
  const src = useLocalImageUrl(id);
  if (!src) return null;
  const image = <img src={src} alt="看房照片" />;
  return plain ? image : <a href={src} target="_blank" rel="noreferrer">{image}</a>;
}
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
  const [current, setCurrent] = useState(0);
  const [saveIssue, setSaveIssue] = useState<{
    message: string;
    row: number | null;
  } | null>(null);
  const [operationError, setOperationError] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const photoTouchStart = useRef<number | null>(null);
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
        ids.push(await putLocalImage(file));
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
      const row = rows[index];
      if (!row) return;
      if (file.size > 12 * 1024 * 1024) throw Error('图片需小于12MB');
      const id = await putLocalImage(file);
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
        const floorPlan = await recognizeStandaloneFloorPlan(
          worker,
          file,
          id,
          row.property.layout,
        );
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
        setCurrent(Math.min(index, Math.max(0, remaining.length - 1)));
        if (!remaining.length) onDone();
      }
    } catch (e) {
      setOperationError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }
  const columns = fields.filter(([k]) => k !== 'name');
  const currentDraft = rows[current]
    ? state.drafts.find((draft) => draft.id === rows[current].draftId)
    : undefined;
  const currentRow = rows[current];
  const currentPhotos = currentRow?.property.photos || [];
  const previewPhotoIndex = previewPhoto ? currentPhotos.indexOf(previewPhoto) : -1;
  const movePreview = (direction: number) => {
    if (!currentPhotos.length || previewPhotoIndex < 0) return;
    setPreviewPhoto(currentPhotos[(previewPhotoIndex + direction + currentPhotos.length) % currentPhotos.length]);
  };
  const fieldIcon = (key: string) =>
    key === 'layout' ? <Home />
    : key === 'area' ? <Maximize2 />
    : key === 'floor' ? <Layers3 />
    : key === 'direction' ? <Sun />
    : key === 'decoration' ? <PaintRoller />
    : key === 'lift' ? <Building2 />
    : key === 'year' ? <Clock3 />
    : <CircleCheck />;
  return (
    <section className="bulk-review">
      <div className="review-pager">
        <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((value) => Math.max(0, value - 1))}><ArrowLeft />上一套</Button>
        <div><strong>{rows.length ? current + 1 : 0}<span> / {rows.length}</span></strong><b>{rows[current]?.property.name || '待核对房源'}</b></div>
        <Button variant="outline" disabled={current >= rows.length - 1} onClick={() => setCurrent((value) => Math.min(rows.length - 1, value + 1))}>下一套<ChevronRight /></Button>
      </div>
      <div className="review-progress"><i style={{ width: `${rows.length ? ((current + 1) / rows.length) * 100 : 0}%` }} /></div>
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
        </div>
      </div>
      {saveIssue && (
        <ErrorNotice title="暂未保存">{saveIssue.message}</ErrorNotice>
      )}
      {operationError && <ErrorNotice>{operationError}</ErrorNotice>}
      {currentDraft?.image && (
        <section className="panel review-source-card">
          <h2>来源截图</h2>
          <LocalReviewImage id={currentDraft.image} />
        </section>
      )}
      {currentRow && (() => {
        const r = currentRow;
        const i = current;
        const area = actualAreaSummary(r.property.area, r.property.floorPlan, r.property.actualArea);
        const updateRoom = (roomId: string, patch: { name?: string; area?: string }) => change(i, { property: { ...r.property, floorPlan: { ...r.property.floorPlan!, confirmed: false, rooms: r.property.floorPlan!.rooms.map((room) => room.id === roomId ? { ...room, ...patch } : room) } } });
        return <>
          <section className="panel recognized-card">
            <h2><CircleCheck />确认信息</h2>
            <label className="review-name"><span>房源名称</span><Input ref={(element) => { nameInputs.current[i] = element; }} disabled={disabled} aria-label={`第${i + 1}行房源名`} aria-invalid={saveIssue?.row === i || undefined} value={r.property.name} placeholder={`未命名房源 ${i + 1}`} onChange={(e) => change(i, { property: { ...r.property, name: e.target.value } })} /></label>
            <div className="review-field-row"><i><BarChart3 /></i><span>总价</span><Input disabled={disabled} aria-label={`第${i + 1}行总价`} inputMode="decimal" value={r.amount} onChange={(e) => change(i, { amount: e.target.value })} /><em>万</em></div>
            <div className="review-field-row"><i><Clock3 /></i><span>报价日期</span><Input disabled={disabled} aria-label={`第${i + 1}行报价日期`} type="date" value={r.date} onChange={(e) => change(i, { date: e.target.value })} /></div>
            {columns.filter(([k]) => k !== 'region' && k !== 'district').map(([k, l]) => <div className="review-field-row" key={k}><i>{fieldIcon(k)}</i><span>{l}</span><PropertyFieldControl field={k} label={l} disabled={disabled} aria-label={`第${i + 1}行${l}`} value={r.property[k] || ''} onChange={(value) => change(i, { property: { ...r.property, [k]: value } })} /><ChevronRight /></div>)}
          </section>
          <section className="panel review-more"><h2>补充资料</h2><div className="location-pair"><label>区域<select className="location-select" disabled={disabled} value={r.property.region || ''} onChange={(e) => change(i, { property: { ...r.property, region: e.target.value, district: '' } })}><option value="">请选择区域</option>{LOCATION_REGIONS.map((v) => <option key={v}>{v}</option>)}</select></label><label>板块<select className="location-select" disabled={disabled} value={r.property.district || ''} onChange={(e) => change(i, { property: { ...r.property, district: e.target.value } })}><option value="">请选择板块</option>{(r.property.region ? LOCATION_DATA[r.property.region] || LOCATION_DISTRICTS : LOCATION_DISTRICTS).map((v) => <option key={v}>{v}</option>)}</select></label></div><button className="review-photo-upload" onClick={() => document.getElementById(`review-photo-${i}`)?.click()}><ImageIcon /><span><b>{r.property.photos?.length ? '继续添加照片' : '上传看房照片'}</b><small>支持多张，点击照片可全屏查看</small></span></button><input id={`review-photo-${i}`} className="hidden" disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { importPhotos(i, e.target.files); e.target.value = ''; }} />{!!r.property.photos?.length && <div className="review-photo-gallery">{r.property.photos.map((id, photoIndex) => <div className={photoIndex === 0 ? 'main-photo' : ''} key={id}><button className="review-photo-preview" onClick={() => setPreviewPhoto(id)}><LocalReviewImage id={id} plain /><span>{photoIndex + 1}</span></button><button className="review-photo-remove" aria-label={`删除第${photoIndex + 1}张看房照片`} onClick={() => change(i, { property: { ...r.property, photos: r.property.photos?.filter((photo) => photo !== id) } })}><Trash2 /></button></div>)}</div>}</section>
          <section className="panel review-area-section"><h2>实际面积</h2><div className="review-area-primary"><label><span>实际面积</span><span className="area-input"><Input disabled={disabled} inputMode="decimal" placeholder="请输入实际面积" value={recognizedAreaTotal(r.property.floorPlan) ?? r.property.actualArea ?? ''} onChange={(e) => change(i, { property: { ...r.property, actualArea: e.target.value } })} /><i>㎡</i></span>{area?.rate != null && <small>得房率 {area.rate}%</small>}</label><button onClick={() => planInputs.current[i]?.click()}><Upload /><span><b>{r.property.floorPlan ? '重新上传户型图' : '上传户型图'}</b><small>识别房间名称和面积</small></span></button><input ref={(element) => { planInputs.current[i] = element; }} className="hidden" disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => importFloorPlan(i, event.target.files?.[0])} /></div>{r.property.floorPlan && <details className="review-room-details" open><summary><span><b>房间面积</b><small>{r.property.floorPlan.rooms.length} 个空间 · 合计 {recognizedAreaTotal(r.property.floorPlan) ?? 0}㎡</small></span><ChevronDown /></summary><div className="review-room-list">{r.property.floorPlan.rooms.map((room, j) => <div className="review-room" key={room.id}><Input aria-label={`房间${j + 1}`} value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} /><label><Input aria-label={`${room.name}面积`} inputMode="decimal" value={room.area} onChange={(e) => updateRoom(room.id, { area: e.target.value })} /><span>㎡</span></label><button className="delete-room" aria-label={`删除${room.name || `房间${j + 1}`}`} onClick={() => change(i, { property: { ...r.property, floorPlan: { ...r.property.floorPlan!, confirmed: false, rooms: r.property.floorPlan!.rooms.filter((value) => value.id !== room.id) } } })}><Trash2 /></button></div>)}<button className="add-review-room" onClick={() => change(i, { property: { ...r.property, floorPlan: { ...r.property.floorPlan!, confirmed: false, rooms: [...r.property.floorPlan!.rooms, { id: newId(), name: '新增房间', area: '', included: true }] } } })}><Plus />添加房间</button></div></details>}</section>
          <section className="panel save-row"><i><Folder /></i><span>保存到房源</span><Select disabled={disabled} value={r.target || 'new'} onValueChange={(value) => change(i, { target: value === 'new' ? '' : String(value) })}><SelectTrigger aria-label={`第${i + 1}行保存到房源`}><SelectValue>{r.target ? state.properties.find((property) => property.id === r.target)?.name : '新增房源'}</SelectValue></SelectTrigger><SelectContent><SelectItem value="new">＋ 新增房源</SelectItem>{state.properties.filter((property) => !property.archived).map((property) => <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>)}</SelectContent></Select></section>
        </>;
      })()}
      {previewPhoto && previewPhotoIndex >= 0 && <div className="review-photo-lightbox" role="dialog" aria-modal="true" aria-label="看房照片全屏预览" onClick={() => setPreviewPhoto(null)} onTouchStart={(event) => { photoTouchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const start = photoTouchStart.current; const end = event.changedTouches[0]?.clientX; if (start != null && end != null && Math.abs(end - start) > 45) movePreview(end < start ? 1 : -1); photoTouchStart.current = null; }}><div onClick={(event) => event.stopPropagation()}><header><span>{previewPhotoIndex + 1} / {currentPhotos.length}</span><button aria-label="关闭照片" onClick={() => setPreviewPhoto(null)}>关闭</button></header><LocalReviewImage id={previewPhoto} plain />{currentPhotos.length > 1 && <nav><button aria-label="上一张照片" onClick={() => movePreview(-1)}>上一张</button><button aria-label="下一张照片" onClick={() => movePreview(1)}>下一张</button></nav>}</div></div>}
      {!!rows.length && <div className="review-bottom-actions"><Button variant="destructive" disabled={disabled} onClick={() => removeOne(current)}>删除</Button><Button disabled={disabled} onClick={saveAll}>{working ? '保存中…' : '保存全部'}</Button></div>}
    </section>
  );
}
