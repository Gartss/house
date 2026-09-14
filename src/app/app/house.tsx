'use client';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

import { Fragment, useEffect, useState, useRef, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import ErrorNotice from '@/components/error-notice';
import HouseDatePicker from '@/components/house-date-picker';
import HouseSelect from '@/components/house-select';
import {
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table';
import {
  HouseState,
  Property,
  Quote,
  emptyState,
  newProperty,
  fields,
  latestQuote,
  activeQuotes,
} from '@/lib/model';
import PropertyFieldControl from './property-field-control';
import { priceSummary } from '@/lib/price-change';
import PropertyExtras from './property-extras';
import {
  actualAreaSummary,
  communityForProperty,
  Community,
} from '@/lib/property-extras';
import {
  mergeImportedDrafts,
  mergePropertyInformation,
} from '@/lib/property-match';
import { newId } from '@/lib/id';
import { errorMessage } from '@/lib/error-message';
import { IMPORT_ACCEPT, prepareImportFiles } from '@/lib/import-files';
import {
  clearLocalData,
  getLocalImageBlob,
  loadLocalState,
  localImagesAsDataUrls,
  putLocalImage,
  restoreLocalImage,
  saveLocalState,
  useLocalImageUrl,
} from '@/lib/local-store';
import {
  LOCATION_DATA,
  LOCATION_DISTRICTS,
  LOCATION_REGIONS,
} from '@/lib/location-data';
import BulkReview from './bulk-review';
import {
  Plus,
  ArrowLeft,
  Upload,
  Search,
  House as HouseIcon,
  GitCompareArrows,
  UserRound,
  Database,
  ShieldCheck,
  ChevronRight,
  Pencil,
  Trash2,
  Maximize2,
  Layers3,
  Sun,
  PaintRoller,
  Building2,
  CircleCheck,
  CircleX,
  ArrowDown,
  BarChart3,
} from 'lucide-react';
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function LocalImage({ id, className, alt }: { id: string; className?: string; alt: string }) {
  const src = useLocalImageUrl(id);
  return src ? <img className={className} src={src} alt={alt} /> : null;
}
function LocalImageLink({ id, children }: { id: string; children: ReactNode }) {
  const href = useLocalImageUrl(id);
  return href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <>{children}</>;
}
export default function HouseApp() {
  const [state, setState] = useState<HouseState>(emptyState());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessageText] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info');
  const setMessage = (text: string) => {
    setMessageKind('info');
    setMessageText(text);
  };
  const setErrorMessage = (text: string) => {
    setMessageKind('error');
    setMessageText(text);
  };
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importProgressLabel, setImportProgressLabel] = useState('');
  const [page, setPage] = useState('list');
  const [detailEditing, setDetailEditing] = useState(false);
  const [importFiles, setImportFiles] = useState<Array<{ name: string; size: string }>>([]);
  const [importDone, setImportDone] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [profileSheet, setProfileSheet] = useState<'privacy' | 'about' | ''>('');
  const [floorplanReturn, setFloorplanReturn] = useState<'detail' | 'edit'>('detail');
  const [edit, setEdit] = useState<Property | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [compareTrendMode, setCompareTrendMode] = useState<'total' | 'unit' | 'community'>('total');
  const [sort, setSort] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [confirmation, setConfirmation] = useState<{
    text: string;
    resolve: (value: boolean) => void;
  } | null>(null);
  const ask = (text: string) =>
    new Promise<boolean>((resolve) => setConfirmation({ text, resolve }));
  const settle = (value: boolean) => {
    confirmation?.resolve(value);
    setConfirmation(null);
  };
  const [maxPrice, setMaxPrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [minUnit, setMinUnit] = useState('');
  const [maxUnit, setMaxUnit] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [layoutFilter, setLayoutFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const reviewReupload = useRef<(() => void) | null>(null);
  const mutex = useRef(false);
  const importCancelled = useRef(false);
  const importProgressRef = useRef(0);
  const importWorker = useRef<{ terminate: () => Promise<unknown> } | null>(null);
  async function load() {
    try {
      const localState = await loadLocalState();
      setState(localState);
      setReady(true);
    } catch (e) {
      setErrorMessage(errorMessage(e, '房源读取失败，请重试。'));
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    shellRef.current?.scrollTo({ top: 0, left: 0 });
  }, [page]);
  async function save(next: HouseState, deletedPropertyIds: string[] = []) {
    if (mutex.current) return false;
    mutex.current = true;
    setBusy(true);
    try {
      void deletedPropertyIds;
      saveLocalState(next);
      setState(next);
      setMessage('');
      return true;
    } catch (e) {
      setErrorMessage(
        `${errorMessage(e, '保存失败')}。未确认保存，请保留当前页面。`,
      );
      return false;
    } finally {
      mutex.current = false;
      setBusy(false);
    }
  }
  const resetForm = () => {
    setPrice('');
    setDate('');
    setNote('');
  };
  function open(p: Property) {
    setEdit(copy(p));
    resetForm();
    setDetailEditing(false);
    setPage('detail');
  }
  async function saveProperty() {
    if (!edit || !edit.name.trim()) {
      setErrorMessage('请填写小区 / 地址');
      return;
    }
    const next = copy(state);
    let property = copy(edit);
    if (price && Number(price) > 0) {
      property.quotes.push({ id: newId(), amount: Number(price), date, createdAt: new Date().toISOString(), note });
    }
    const i = next.properties.findIndex((p) => p.id === property.id);
    if (i < 0) next.properties.push(property);
    else next.properties[i] = property;
    if (await save(next)) {
      setEdit(copy(property));
      resetForm();
      setDetailEditing(false);
      setPage('detail');
    }
  }
  async function addQuote() {
    if (!edit || !Number(price) || Number(price) <= 0) {
      setErrorMessage('请填写有效总价');
      return;
    }
    const q: Quote = {
      id: newId(),
      amount: Number(price),
      date,
      createdAt: new Date().toISOString(),
      note,
    };
    const p = { ...edit, quotes: [...edit.quotes, q] };
    const next = copy(state);
    const i = next.properties.findIndex((x) => x.id === p.id);
    if (i < 0) {
      setErrorMessage('请先保存房源资料');
      return;
    }
    next.properties[i] = p;
    if (await save(next)) {
      setEdit(p);
      resetForm();
    }
  }
  async function deleteQuote(id: string) {
    if (!edit || busy) return;
    const nextProperty = {
      ...edit,
      quotes: edit.quotes.filter((q) => q.id !== id),
    };
    const next = copy(state);
    const index = next.properties.findIndex((p) => p.id === edit.id);
    if (index < 0) return;
    next.properties[index] = nextProperty;
    if (await save(next)) setEdit(nextProperty);
  }
  async function deleteProperties(ids: string[]) {
    if (busy || !ids.length) return;
    const targets = state.properties.filter((p) => ids.includes(p.id));
    if (
      !(await ask(
        `删除以下 ${targets.length} 套房源？\n${targets.map((p) => p.name).join('、')}\n对应报价历史也会删除，无法直接撤销。原始图片文件保留，不影响其他房源。`,
      ))
    )
      return;
    const next = copy(state);
    next.properties = next.properties.filter((p) => !ids.includes(p.id));
    if (await save(next, ids)) {
      setSelected(selected.filter((id) => !ids.includes(id)));
      setEdit(null);
      setPage('list');
      setMessage('房源及对应报价历史已删除');
    }
  }
  async function importImages(files: FileList | null, replaceExisting = false) {
    if (!files || busy) return;
    const selectedFiles = Array.from(files);
    importCancelled.current = false;
    setImportFailed(false);
    setImportFiles(selectedFiles.map((file) => ({
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    })));
    setImportDone(false);
    setPage('import');
    setBusy(true);
    importProgressRef.current = 0;
    setImportProgress(0);
    setImportProgressLabel('正在准备图片和 PDF');
    let fileList: Awaited<ReturnType<typeof prepareImportFiles>>;
    try {
      fileList = await prepareImportFiles(selectedFiles, (name, page, total) => {
        setImportProgressLabel(`正在转换 ${name} · 第 ${page}/${total} 页`);
      });
    } catch (e) {
      setBusy(false);
      setImportFailed(true);
      setErrorMessage(`导入未开始：${errorMessage(e)}`);
      if (fileInput.current) fileInput.current.value = '';
      return undefined;
    }
    if (importCancelled.current) {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
      return undefined;
    }
    setImportFiles(fileList.map(({ file }) => ({
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    })));
    const totalFiles = fileList.length;
    let currentFileIndex = 0;
    const updateImportProgress = (localProgress: number, label: string) => {
      const value = Math.min(
        99,
        Math.round(((currentFileIndex + localProgress) / totalFiles) * 100),
      );
      if (value < importProgressRef.current) return;
      importProgressRef.current = value;
      setImportProgress(value);
      setImportProgressLabel(label);
    };
    importProgressRef.current = 0;
    setImportProgress(0);
    setImportProgressLabel(
      totalFiles === 1 ? '准备导入文件' : `准备导入 ${totalFiles} 页/张`,
    );
    let next = copy(state);
    try {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('chi_sim', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
        logger: (m) => {
          if (m.status === 'recognizing text')
            updateImportProgress(
              0.1 + m.progress * 0.55,
              `正在识别第 ${currentFileIndex + 1}/${totalFiles} 张`,
            );
        },
      });
      importWorker.current = worker;
      try {
        for (const [index, prepared] of fileList.entries()) {
          const { file } = prepared;
          if (importCancelled.current) return undefined;
          currentFileIndex = index;
          updateImportProgress(
            0.02,
            `正在上传第 ${index + 1}/${totalFiles} 张`,
          );
          const id = await putLocalImage(file);
          if (importCancelled.current) return undefined;
          updateImportProgress(
            0.08,
            `正在读取第 ${index + 1}/${totalFiles} 张`,
          );
          const existingDraftIndex = next.drafts.findIndex(
            (draft) => draft.image === id,
          );
          if (
            next.properties.some((p) => p.images.includes(id)) ||
            (existingDraftIndex >= 0 && !replaceExisting)
          ) {
            updateImportProgress(1, `第 ${index + 1}/${totalFiles} 张已存在`);
            continue;
          }
          let text = prepared.pdfText;
          try {
            const recognizedText = (await worker.recognize(file)).data.text;
            text = [prepared.pdfText, recognizedText].filter(Boolean).join('\n');
            updateImportProgress(
              0.65,
              `已识别第 ${index + 1}/${totalFiles} 张`,
            );
          } catch {
            setErrorMessage('识别未完成，已保留原图，可手动填写。');
          }
          const { parseScreenshot } = await import('@/lib/ocr');
          const properties = parseScreenshot(text, id);
          if (
            properties.length === 1 &&
            (!properties[0].area ||
              Number(properties[0].area) < 10 ||
              (!properties[0].lift && /电梯/.test(text)) ||
              (!properties[0].layout && /(?:户型|室[\s\S]*厅)/.test(text)))
          ) {
            try {
              await worker.setParameters({
                tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
              });
              const retryText = (await worker.recognize(file)).data.text;
              await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
              const retry = parseScreenshot(retryText, id);
              if (retry.length === 1) {
                if (Number(retry[0].area) >= 10)
                  properties[0].area = retry[0].area;
                properties[0] = mergePropertyInformation(
                  properties[0],
                  retry[0],
                );
                text = `${text}\n${retryText}`.slice(0, 50000);
              }
              if (!properties[0].area) {
                await worker.setParameters({
                  tessedit_pageseg_mode: PSM.SPARSE_TEXT,
                });
                const { recognizeBuildingArea } =
                  await import('@/lib/building-area-ocr');
                const focused = await recognizeBuildingArea(worker, file, id);
                if (focused.area) properties[0].area = focused.area;
                if (focused.text)
                  text = `${text}\n${focused.text}`.slice(0, 50000);
                await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
              }
            } catch {
              await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
            }
          }
          if (properties.length === 1) {
            try {
              const { recognizeFloorPlan } =
                await import('@/lib/floorplan-ocr');
              properties[0].floorPlan = await recognizeFloorPlan(
                worker,
                file,
                id,
                text,
                prepared.source === 'pdf',
              );
            } catch {
              setErrorMessage('户型面积未完整识别，请在核对页补充。');
            }
          }
          const draft = {
            id:
              existingDraftIndex >= 0
                ? next.drafts[existingDraftIndex].id
                : newId(),
            image: id,
            text,
            properties,
          };
          if (existingDraftIndex >= 0) next.drafts[existingDraftIndex] = draft;
          else next.drafts.push(draft);
          updateImportProgress(1, `已完成第 ${index + 1}/${totalFiles} 张`);
        }
        importProgressRef.current = 99;
        setImportProgress(99);
        setImportProgressLabel('正在合并房源信息');
        next = mergeImportedDrafts(next);
      } finally {
        if (!importCancelled.current) await worker.terminate();
        importWorker.current = null;
      }
      if (importCancelled.current) return undefined;
      const saved = await save(next);
      if (saved) {
        importProgressRef.current = 100;
        setImportProgress(100);
        setImportProgressLabel('导入完成');
        setImportDone(true);
      }
      return saved ? next : undefined;
    } catch (e) {
      if (importCancelled.current) return undefined;
      setImportFailed(true);
      setBusy(false);
      if (next.drafts.length > state.drafts.length)
        return (await save(next)) ? next : undefined;
      setErrorMessage(
        `导入未全部完成：${errorMessage(e)}。可重新选择图片或 PDF 重试。`,
      );
      return undefined;
    } finally {
      setBusy(false);
      if (!replaceExisting && !importDone) {
        setImportProgress((value) => value ?? 0);
      }
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function backup() {
    setBusy(true);
    try {
      const ids = Array.from(
        new Set([
          ...state.properties.flatMap((p) => p.images),
          ...state.drafts.map((d) => d.image),
          ...(state.communities || []).flatMap((c) =>
            c.quotes.map((q) => q.image),
          ),
        ]),
      );
      const images = await localImagesAsDataUrls(ids);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ format: 'house-v1', state, images })], {
          type: 'application/json',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `House-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage('备份已生成，请保存到文件。包含原图，请妥善保管。');
    } catch (e) {
      setErrorMessage(errorMessage(e, '备份生成失败，请重试。'));
    } finally {
      setBusy(false);
    }
  }
  async function restore(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 45 * 1024 * 1024) throw Error('备份文件过大');
      const b = JSON.parse(await file.text());
      const { validateState } = await import('@/lib/model');
      if (
        b.format !== 'house-v1' ||
        !validateState(b.state) ||
        !b.images ||
        typeof b.images !== 'object'
      )
        throw Error('不是有效的House备份');
      if (
        !(await ask(
          '将补充备份中当前不存在的房源和草稿；同编号的现有资料保持不变。继续恢复？',
        ))
      )
        return;
      for (const [id, url] of Object.entries(b.images)) {
        if (
          typeof url !== 'string' ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(url)
        )
          throw Error('备份图片格式错误');
        await restoreLocalImage(id, url);
      }
      const next = copy(state);
      next.properties.push(
        ...b.state.properties.filter(
          (p: Property) => !next.properties.some((x) => x.id === p.id),
        ),
      );
      next.drafts.push(
        ...b.state.drafts.filter(
          (d: any) => !next.drafts.some((x) => x.id === d.id),
        ),
      );
      setBusy(false);
      await save(next);
    } catch (e) {
      setErrorMessage(`恢复失败：${errorMessage(e)}`);
    } finally {
      setBusy(false);
      if (backupInput.current) backupInput.current.value = '';
    }
  }
  const filtered = state.properties
    .filter(
      (p) =>
        [p.name, p.layout, p.note, p.region, p.district]
          .join(' ')
          .includes(query) &&
        (!minPrice ||
          (!!latestQuote(p) && latestQuote(p)!.amount >= Number(minPrice))) &&
        (!maxPrice ||
          (!!latestQuote(p) && latestQuote(p)!.amount <= Number(maxPrice))) &&
        (!minArea || Number(p.area) >= Number(minArea)) &&
        (!maxArea || (!!p.area && Number(p.area) <= Number(maxArea))) &&
        (!regionFilter || p.region === regionFilter) &&
        (!districtFilter || p.district === districtFilter) &&
        (!minUnit ||
          (priceSummary(p).unit !== null &&
            priceSummary(p).unit! >= Number(minUnit))) &&
        (!maxUnit ||
          (priceSummary(p).unit !== null &&
            priceSummary(p).unit! <= Number(maxUnit))) &&
        (!layoutFilter || p.layout.replace(/\s/g, '') === layoutFilter),
    )
    .sort((a, b) =>
      sort === 'price-asc'
        ? (latestQuote(a)?.amount || Infinity) -
          (latestQuote(b)?.amount || Infinity)
        : sort === 'price-desc'
          ? (latestQuote(b)?.amount || -Infinity) -
            (latestQuote(a)?.amount || -Infinity)
        : sort === 'unit'
          ? (priceSummary(a).unit ?? Infinity) -
            (priceSummary(b).unit ?? Infinity)
          : sort === 'area'
            ? Number(a.area) - Number(b.area)
            : sort === 'date'
              ? (latestQuote(b)?.date || '').localeCompare(
                  latestQuote(a)?.date || '',
                )
              : 0,
    );
  const visible = filtered;
  const reviewCount = state.drafts.reduce(
    (count, draft) => count + draft.properties.length,
    0,
  );

  const form = edit && <div className="property-editor">
    <section className="panel form-section"><h2>基本信息</h2><div className="edit-grid">
      <label className="wide">小区 / 地址<Input disabled={busy} value={edit.name} onChange={(e) => setEdit({...edit,name:e.target.value})}/></label>
      <div className="location-pair">
        <label>区域<HouseSelect className="location-select" disabled={busy} value={edit.region || ''} placeholder="请选择区域" options={LOCATION_REGIONS} onChange={(value) => setEdit({...edit,region:value,district:''})}/></label>
        <label>板块<HouseSelect className="location-select" disabled={busy} value={edit.district || ''} placeholder="请选择板块" options={edit.region ? LOCATION_DATA[edit.region] || LOCATION_DISTRICTS : LOCATION_DISTRICTS} onChange={(value) => setEdit({...edit,district:value})}/></label>
      </div>
    </div></section>
    <section className="panel form-section"><h2>价格</h2><div className="edit-grid">
      <label>总价（万元）<Input inputMode="decimal" value={price} placeholder={latestQuote(edit)?.amount ? String(latestQuote(edit)!.amount) : '请输入'} onChange={(e)=>setPrice(e.target.value)}/></label>
      <label>单价（元/㎡）<Input inputMode="decimal" value={edit.unitPrice || ''} placeholder={priceSummary(edit).unit ? String(Math.round(priceSummary(edit).unit!)) : '请输入'} onChange={(e)=>setEdit({...edit,unitPrice:e.target.value})}/></label>
      <label className="wide">报价日期（未知可空）<HouseDatePicker value={date} onChange={setDate}/></label>
    </div></section>
    <section className="panel form-section"><h2>户型与房况</h2><div className="edit-grid">
      {fields.filter(([key]) => ['layout','area','floor','direction','year','code','decoration','lift'].includes(key)).map(([key,label]) => <label key={key}>{label}<PropertyFieldControl field={key} label={label} disabled={busy} value={edit[key] || ''} onChange={(value)=>setEdit({...edit,[key]:value})}/></label>)}
      <label>核验码<Input disabled={busy} value={edit.code} placeholder="选填" onChange={(e)=>setEdit({...edit,code:e.target.value})}/></label>
    </div></section>
  </div>;
  const priceForm = (
    <div className="edit-grid">
      <label>
        总价（万元）
        <Input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label>
        报价日期（未知可空）
        <HouseDatePicker value={date} onChange={setDate} />
      </label>
    </div>
  );
  const savedEdit = edit
    ? state.properties.find((property) => property.id === edit.id)
    : undefined;
  const hasUnsavedDetailChanges =
    !!edit &&
    (!savedEdit ||
      JSON.stringify(savedEdit) !== JSON.stringify(edit) ||
      !!price ||
      !!date ||
      !!note);
  const activeFilterCount = [
    maxPrice,
    minPrice,
    minUnit,
    maxUnit,
    minArea,
    maxArea,
    layoutFilter,
    regionFilter,
    districtFilter,
  ].filter(Boolean).length;
  return (
    <main ref={shellRef} className={`house-shell screen-${page}${filterOpen ? ' filter-active' : ''}`}>
      <div className={`utility-bar page-${page}`}>
        {page === 'list' ? (
          <>
            <div className="home-heading"><h1>我的看房</h1></div>
            <Button
              className="round-add"
              aria-label="新建房源"
              onClick={() => {
                setEdit(newProperty());
                resetForm();
                setDetailEditing(true);
                setPage('detail');
              }}
            ><Plus /></Button>
          </>
        ) : page === 'profile' ? (
          <span />
        ) : page === 'import' ? (
          <div className="page-title"><h1>导入房源</h1></div>
        ) : page === 'review' ? (
          <div className="page-title"><h1>核对房源</h1></div>
        ) : page === 'floorplan' ? (
          <div className="page-title"><h1>户型与实际面积</h1></div>
        ) : page === 'community' ? (
          <div className="page-title"><h1>小区成交价</h1></div>
        ) : page === 'compare' ? (
          <div className="page-title"><h1>房源对比</h1></div>
        ) : page === 'compare-trend' ? (
          <div className="page-title"><h1>{compareTrendMode === 'community' ? '小区成交价走势' : '价格走势'}</h1></div>
        ) : (
          <div className="page-title"><h1>{detailEditing ? (savedEdit ? '编辑房源' : '新建房源') : (edit?.name || '房源详情')}</h1></div>
        )}
        <input
          ref={backupInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => restore(e.target.files?.[0])}
        />
      </div>
      {page !== 'import' && (busy || (message && message !== '已保存')) &&
        (busy && importProgress !== null ? (
          <div className="status" role="status">
            <div className="import-progress" aria-label="截图导入进度">
              <div className="import-progress-heading">
                <span>{importProgressLabel}</span>
                <strong>{importProgress}%</strong>
              </div>
              <div className="import-progress-track">
                <div
                  className="import-progress-value"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : messageKind === 'error' && message ? (
          <ErrorNotice>{message}</ErrorNotice>
        ) : (
          <div className="status" role="status">
            {busy ? '处理中，请稍候… ' : ''}
            {message === '已保存' ? '' : message}
          </div>
        ))}
      {!ready ? (
        <section className="welcome">
          <p>正在读取房源…</p>
          <Button onClick={load}>重新读取</Button>
        </section>
      ) : (
        <>
          {!['list', 'profile'].includes(page) && (
            <div className="detail-topbar">
              <Button
                disabled={busy}
                variant="ghost"
                onClick={async () => {
                  if (
                    (page === 'review' ||
                      (page === 'detail' && hasUnsavedDetailChanges)) &&
                    !(await ask('返回列表？未保存的修改将放弃。'))
                  )
                    return;
                  if (page === 'floorplan') {
                    setPage('detail');
                    setDetailEditing(floorplanReturn === 'edit');
                  } else if (page === 'community') {
                    setPage('detail');
                    setDetailEditing(false);
                  } else if (page === 'compare-trend') {
                    setPage('compare');
                  } else if (page === 'detail' && detailEditing && savedEdit) {
                    setEdit(copy(savedEdit));
                    setDetailEditing(false);
                  } else setPage('list');
                }}
              >
                <ArrowLeft />
                返回
              </Button>
              {page === 'detail' && edit && !detailEditing && (
                <Button variant="ghost" onClick={() => setDetailEditing(true)}>
                  <Pencil size={18} /> 编辑
                </Button>
              )}
              {page === 'review' && (
                <Button
                  className="review-reupload-button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => reviewReupload.current?.()}
                >
                  重新上传
                </Button>
              )}
              {(page === 'floorplan' || page === 'community') && <Button variant="ghost" onClick={async () => { await saveProperty(); setDetailEditing(page === 'floorplan' && floorplanReturn === 'edit'); }}>完成</Button>}
            </div>
          )}
          {page === 'list' && (
            <>
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept={IMPORT_ACCEPT}
                multiple
                onChange={(e) => importImages(e.target.files)}
              />
              <nav className="status-tabs" aria-label="房源状态">
                <button className="active">
                  <strong>全部房源</strong><span>{state.properties.length}套</span>
                </button>
                <button
                  disabled={reviewCount === 0}
                  onClick={() => setPage('review')}
                >
                  <strong>待核对</strong><span>{reviewCount}套</span>
                </button>
              </nav>
              <div className="search">
                <Search size={18} />
                <Input
                  aria-label="搜索小区、户型或备注"
                  placeholder="搜索小区、户型或备注"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="list-controls home-filters">
                <button className={activeFilterCount === 0 && !sort ? 'selected' : ''} onClick={() => {
                  setMinPrice(''); setMaxPrice(''); setMinUnit(''); setMaxUnit(''); setMinArea(''); setMaxArea(''); setLayoutFilter(''); setRegionFilter(''); setDistrictFilter(''); setSort('');
                }}>全部</button>
                <button
                  className={`sort-control ${sort.startsWith('price-') ? 'selected' : ''}`}
                  aria-label={sort === 'price-asc' ? '总价从低到高，点击切换为从高到低' : sort === 'price-desc' ? '总价从高到低，点击清除排序' : '按总价从低到高排序'}
                  onClick={() => setSort((value) => value === 'price-asc' ? 'price-desc' : value === 'price-desc' ? '' : 'price-asc')}
                >
                  {sort === 'price-asc' ? '总价 ↑' : sort === 'price-desc' ? '总价 ↓' : '总价'}
                </button>
                <HouseSelect className="sort-control" ariaLabel="户型筛选" value={layoutFilter} placeholder="户型" options={Array.from(new Set(state.properties.map((p) => p.layout.replace(/\s/g, '')).filter(Boolean))).sort((a,b) => a.localeCompare(b,'zh-CN',{numeric:true}))} onChange={setLayoutFilter} />
                <HouseSelect className="sort-control" ariaLabel="区域筛选" value={regionFilter} placeholder="区域" options={Array.from(new Set(state.properties.map((p) => p.region).filter((value): value is string => !!value))).sort()} onChange={(value) => { setRegionFilter(value); setDistrictFilter(''); }} />
                <div className="filter-panel">
                  <button type="button" onClick={() => setFilterOpen(true)}>
                    更多
                    {activeFilterCount > 0 && (
                      <span className="filter-count">{activeFilterCount}</span>
                    )}
                  </button>
                </div>
              </div>
              {filterOpen && <div className="filter-modal" role="dialog" aria-modal="true" aria-label="筛选房源">
                <button className="filter-scrim" aria-label="关闭筛选" onClick={() => setFilterOpen(false)} />
                <section className="filter-sheet">
                  <i />
                  <header><button onClick={() => setFilterOpen(false)}>取消</button><h2>筛选房源</h2><button onClick={() => setFilterOpen(false)}>完成</button></header>
                  <div className="filter-sheet-scroll">
                    <div className="filter-fields">
                    <div className="compact-filters">
                      <label>
                        区域
                        <HouseSelect className="location-select" value={regionFilter} placeholder="全部区域" options={Array.from(
                            new Set(
                              state.properties
                                .map((p) => p.region)
                                .filter((value): value is string => !!value),
                            ),
                          )
                            .sort()} onChange={(value) => { setRegionFilter(value); setDistrictFilter(''); }} />
                      </label>
                      <label>
                        板块
                        <HouseSelect className="location-select" value={districtFilter} placeholder="全部板块" options={Array.from(
                            new Set(
                              state.properties
                                .filter(
                                  (p) =>
                                    !regionFilter || p.region === regionFilter,
                                )
                                .map((p) => p.district)
                                .filter((value): value is string => !!value),
                            ),
                          )
                            .sort()} onChange={setDistrictFilter} />
                      </label>
                      <div className="range-filter">
                        <span>总价（万元）</span>
                        <div className="range-inputs">
                          <Input aria-label="最低总价" placeholder="最低" type="number" min="0" inputMode="decimal" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                          <span>−</span>
                          <Input aria-label="最高总价" placeholder="最高" type="number" min="0" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                        </div>
                        {minPrice && maxPrice && Number(minPrice) > Number(maxPrice) && <ErrorNotice compact>最低总价不能大于最高总价</ErrorNotice>}
                      </div>
                      <div className="range-filter">
                        <span>面积（㎡）</span>
                        <div className="range-inputs">
                          <Input
                            aria-label="最小面积"
                            placeholder="最低"
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={minArea}
                            onChange={(e) => setMinArea(e.target.value)}
                          />
                          <span>−</span>
                          <Input
                            aria-label="最大面积"
                            placeholder="最高"
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={maxArea}
                            onChange={(e) => setMaxArea(e.target.value)}
                          />
                        </div>
                        {minArea &&
                          maxArea &&
                          Number(minArea) > Number(maxArea) && (
                            <ErrorNotice compact>
                              最低面积不能大于最高面积
                            </ErrorNotice>
                          )}
                      </div>
                      <div className="range-filter">
                        <span>单价（元/㎡）</span>
                        <div className="range-inputs">
                          <Input
                            aria-label="最低单价"
                            placeholder="最低"
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={minUnit}
                            onChange={(e) => setMinUnit(e.target.value)}
                          />
                          <span>−</span>
                          <Input
                            aria-label="最高单价"
                            placeholder="最高"
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={maxUnit}
                            onChange={(e) => setMaxUnit(e.target.value)}
                          />
                        </div>
                        {minUnit &&
                          maxUnit &&
                          Number(minUnit) > Number(maxUnit) && (
                            <ErrorNotice compact>
                              最低单价不能大于最高单价
                            </ErrorNotice>
                          )}
                      </div>
                      <label>
                        户型
                        <HouseSelect className="location-select" value={layoutFilter} placeholder="全部户型" options={Array.from(
                            new Set(
                              state.properties
                                .map((p) => p.layout.replace(/\s/g, ''))
                                .filter(Boolean),
                            ),
                          )
                            .sort((a, b) =>
                              a.localeCompare(b, 'zh-CN', { numeric: true }),
                            )} onChange={setLayoutFilter} />
                      </label>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery('');
                        setMinPrice('');
                        setMaxPrice('');
                        setMinUnit('');
                        setMaxUnit('');
                        setMinArea('');
                        setMaxArea('');
                        setLayoutFilter('');
                        setRegionFilter('');
                        setDistrictFilter('');
                        setSort('');
                      }}
                    >
                      重置筛选
                    </Button>
                  </div>
                  </div>
                  <footer><Button variant="outline" onClick={() => { setMinPrice(''); setMaxPrice(''); setMinUnit(''); setMaxUnit(''); setMinArea(''); setMaxArea(''); setLayoutFilter(''); setRegionFilter(''); setDistrictFilter(''); }}>重置</Button><Button onClick={() => setFilterOpen(false)}>查看 {visible.length} 套房源</Button></footer>
                </section>
              </div>}
              {selected.length > 0 && <div className="compare-selection-bar"><span>已选 <b>{selected.length}</b> 套</span><button onClick={() => setSelected([])}>清空</button><Button className="selection-delete" variant="destructive" disabled={busy} onClick={() => deleteProperties(selected)}>删除</Button><Button className="selection-compare" disabled={selected.length < 2} onClick={() => setPage('compare')}>{selected.length < 2 ? '再选 1 套' : '对比'}</Button></div>}
              {!visible.length ? (
                <section className="welcome empty">
                  <HouseIcon size={32} />
                  <h2>
                    {state.properties.length
                      ? '没有匹配的房源'
                      : '从一张收藏截图开始'}
                  </h2>
                  <p>导入后先核对，缺少的信息可以之后再补。</p>
                </section>
              ) : (
                <div className="property-list-scroll">
                  <PropertyTable
                    theme="price"
                    onSort={setSort}
                    properties={visible}
                    selected={selected}
                    setSelected={setSelected}
                    onOpen={open}
                  />
                </div>
              )}
              <div className="table-meta">
                <span>{visible.length} 套房源</span>
                {selected.length > 0 && (
                  <>
                    <span>已选 {selected.length} 套</span>
                    <Button variant="ghost" onClick={() => setSelected([])}>
                      清空选择
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() => deleteProperties(selected)}
                    >
                      删除所选
                    </Button>
                  </>
                )}
              </div>
              <div className="floating-actions">
                <Button
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload />
                  <span><strong>导入房源</strong><small>支持相册截图和 PDF 导入</small></span>
                </Button>
              </div>
            </>
          )}
          {page === 'compare' && (
            <Comparison
              state={state}
              properties={state.properties.filter((p) =>
                selected.includes(p.id),
              )}
              onOpen={open}
              onRemove={(id) => setSelected(selected.filter((value) => value !== id))}
              onManage={() => setPage('list')}
              onTrend={(mode) => { setCompareTrendMode(mode); setPage('compare-trend'); }}
            />
          )}
          {page === 'compare-trend' && <CompareTrendDetail state={state} properties={state.properties.filter((property) => selected.includes(property.id))} mode={compareTrendMode} />}
          {page === 'detail' && edit && (
            detailEditing ? <>
              {form}
              <PropertyExtras
                key={edit.id}
                property={edit}
                onChange={setEdit}
                state={state}
                onSave={save}
                busy={busy}
                onBusy={setBusy}
                onMessage={setMessage}
                compactArea
                onOpenFloorplan={() => { setFloorplanReturn('edit'); setPage('floorplan'); }}
              />
              <section className="panel form-section"><h2>备注</h2><label><textarea value={edit.note} placeholder="采光、噪音、装修和看房感受" onChange={(e)=>setEdit({...edit,note:e.target.value})}/></label></section>
              <div className="sticky-detail-actions">
                {savedEdit && <Button variant="outline" onClick={() => { setEdit(copy(savedEdit)); setDetailEditing(false); }}>取消</Button>}
                <Button disabled={busy} onClick={saveProperty}>保存房源</Button>
              </div>
            </> : <PropertyDetail
              property={edit}
              state={state}
              selected={selected.includes(edit.id)}
              onToggleCompare={() => setSelected(selected.includes(edit.id) ? selected.filter((id) => id !== edit.id) : [...selected, edit.id])}
              onEdit={() => { setFloorplanReturn('detail'); setPage('floorplan'); }}
              onCommunity={() => setPage('community')}
              onQuote={() => { setDetailEditing(true); setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="新增报价总价"]')?.focus(), 0); }}
            />
          )}
          {page === 'floorplan' && edit && <PropertyExtras key={`floorplan-${edit.id}`} property={edit} onChange={setEdit} state={state} onSave={save} busy={busy} onBusy={setBusy} onMessage={setMessage} onlyArea />}
          {page === 'community' && edit && <PropertyExtras key={`community-${edit.id}`} property={edit} onChange={setEdit} state={state} onSave={save} busy={busy} onBusy={setBusy} onMessage={setMessage} onlyCommunity />}
          {page === 'review' && (
            <BulkReview
              state={state}
              busy={busy}
              ask={ask}
              onMessage={setMessage}
              onSave={save}
              onReupload={(files) => importImages(files, true)}
              onDone={() => setPage('list')}
              reuploadControlRef={reviewReupload}
            />
          )}
          {page === 'import' && (
            <section className="import-page">
              {messageKind === 'error' && message && <ErrorNotice>{message}</ErrorNotice>}
              <div className={`import-hero${importDone ? ' is-success' : ''}${importFailed ? ' is-failure' : ''}`}>
                {importDone ? <CircleCheck size={46} /> : importFailed ? <CircleX size={46} /> : <Upload size={46} />}
                <strong>{importProgress ?? 0}%</strong>
                <div className="import-progress-track"><div className="import-progress-value" style={{ width: `${importProgress ?? 0}%` }} /></div>
                <h2>{importDone ? '房源信息识别完成' : importFailed ? '导入未完成' : '正在识别房源信息'}</h2>
                <p>{importFiles.length ? `共 ${importFiles.length} 页/张` : '正在准备文件'}{importProgressLabel ? ` · ${importProgressLabel}` : ''}</p>
                {(importDone || importFailed) && <div className="import-result-badge">{importDone ? '已完成，可进入核对' : '请返回重新选择文件'}</div>}
              </div>
              <div className="import-file-list">
                {importFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`}><HouseIcon size={22} /><span><b>{file.name}</b><small>{file.size}</small></span><strong>{importDone || (importProgress ?? 0) >= ((index + 1) / importFiles.length) * 100 ? '已完成' : '处理中'}</strong></div>
                ))}
              </div>
              <Button className="import-bottom-action" variant={importDone ? 'default' : 'outline'} onClick={async () => {
                if (importDone) setPage('review');
                else {
                  importCancelled.current = true;
                  await importWorker.current?.terminate().catch(() => undefined);
                  importWorker.current = null;
                  setBusy(false);
                  setPage('list');
                }
              }}>
                {importDone ? '去核对信息' : importFailed ? '返回重新选择' : '取消导入'}
              </Button>
            </section>
          )}
          {page === 'profile' && (
            <section className="profile-page">
              <h2 className="profile-section-title">数据管理</h2>
              <section className="panel settings-list profile-settings">
                <button onClick={backup}><Database /><span><strong>导出备份</strong><small>保存房源、价格记录和图片</small></span><ChevronRight /></button>
                <button onClick={() => backupInput.current?.click()}><Upload /><span><strong>导入备份</strong><small>从 House 备份文件恢复数据</small></span><ChevronRight /></button>
                <button className="danger-row" onClick={async () => {
                  if (!(await ask('清空全部本地数据？\n房源、报价记录和保留的截图都会从这台设备删除。此操作无法撤销，建议先导出备份。'))) return;
                  await clearLocalData();
                  const next = emptyState();
                  setState(next);
                  setSelected([]);
                  setMessage('本机房源数据已清空');
                }}><Trash2 /><span><strong>清空本地数据</strong><small>删除这台手机上的全部房源资料</small></span><ChevronRight /></button>
              </section>
              <h2 className="profile-section-title">隐私与应用</h2>
              <section className="panel settings-list profile-settings">
                <button onClick={() => setProfileSheet('privacy')}><ShieldCheck /><span><strong>隐私政策</strong><small>了解本地数据和图片权限的使用方式</small></span><ChevronRight /></button>
                <button onClick={() => setProfileSheet('about')}><HouseIcon /><span><strong>关于 House</strong><small>版本 1.0 · 看房记录与对比工具</small></span><ChevronRight /></button>
              </section>
              {profileSheet && <div className="profile-modal"><button className="profile-scrim" aria-label="关闭" onClick={() => setProfileSheet('')} /><section className="profile-sheet">{profileSheet === 'privacy' ? <><ShieldCheck className="sheet-icon"/><h2>你的数据由你保管</h2><p>房源信息、截图和价格记录默认只保存在这台设备中。House 不要求注册账号，也不会自动将资料上传到服务器。</p><div className="privacy-points"><span>本地保存</span><span>可导出备份</span></div></> : <><HouseIcon className="sheet-icon"/><h2>House</h2><p>用于整理看房资料、记录价格变化并对比候选房源。</p><div className="about-version"><span>当前版本</span><strong>1.0.0</strong></div></>}<Button variant="outline" onClick={() => setProfileSheet('')}>{profileSheet === 'privacy' ? '我知道了' : '完成'}</Button></section></div>}
            </section>
          )}
        </>
      )}
      {ready && (['list', 'profile'].includes(page) || (page === 'compare' && selected.length < 2)) && (
        <nav className="bottom-nav" aria-label="主要导航">
          <button className={page === 'list' ? 'active' : ''} onClick={() => setPage('list')}><HouseIcon /><span>房源</span></button>
          <button className={page === 'compare' ? 'active' : ''} onClick={() => setPage('compare')}><GitCompareArrows /><span>对比{selected.length ? ` ${selected.length}` : ''}</span></button>
          <button className={page === 'profile' ? 'active' : ''} onClick={() => setPage('profile')}><UserRound /><span>我的</span></button>
        </nav>
      )}
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(value) => {
          if (!value) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>请确认</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {confirmation?.text}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              取消 / 保留原值
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => settle(true)}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
function PropertyDetail({
  property,
  state,
  selected,
  onToggleCompare,
  onEdit,
  onCommunity,
  onQuote,
}: {
  property: Property;
  state: HouseState;
  selected: boolean;
  onToggleCompare: () => void;
  onEdit: () => void;
  onCommunity: () => void;
  onQuote: () => void;
}) {
  const quote = latestQuote(property);
  const summary = actualAreaSummary(property.area, property.floorPlan, property.actualArea);
  const community = communityForProperty(state, property);
  const facts = [
    ['户型', property.layout, <HouseIcon key="layout" />],
    ['建筑面积', property.area ? `${property.area}㎡` : '待补充', <Maximize2 key="area" />],
    ['楼层', property.floor, <Layers3 key="floor" />],
    ['朝向', property.direction, <Sun key="direction" />],
    ['装修', property.decoration, <PaintRoller key="decoration" />],
    ['电梯', property.lift === '是' ? '有电梯' : property.lift === '否' ? '无电梯' : property.lift, <Building2 key="lift" />],
  ] as const;
  return <div className="property-detail-view">
    <section className="panel detail-price-card">
      <div><strong className="hero-price">{quote ? `${quote.amount}万` : '暂无报价'}</strong><p>{priceSummary(property).unit?.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) ?? '—'}元/㎡</p><PriceChange value={priceSummary(property).totalDelta} unit="万" /><small>更新于 {quote?.date || '日期待补'}</small></div>
      <div className="detail-trend"><Button variant="outline" onClick={onQuote}>记录报价</Button><PriceChart property={property} /></div>
    </section>
    <section className="panel"><h2>基本信息</h2><div className="fact-grid">
      {facts.map(([label,value,icon]) => <div key={label}><i>{icon}</i><span>{label}</span><strong>{value || '待补充'}</strong></div>)}
    </div></section>
    <section className="panel area-card"><h2>面积信息</h2><div><span>实际面积<strong>{summary ? `${summary.total}㎡` : '待补'}</strong></span><span>得房率<strong>{summary?.rate != null ? `${summary.rate}%` : '—'}</strong></span><button onClick={onEdit}>{property.floorPlan ? '查看户型' : '上传户型图'} <ChevronRight /></button></div></section>
    <button className="panel community-card" onClick={onCommunity}><span><h2>小区成交价</h2>{community?.quotes.length ? <p>{community.quotes.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0].amount} 万元 · {community.quotes.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0].period || '时间待补'}</p> : <p>暂无记录<small>该小区近期暂无成交数据</small></p>}</span><ChevronRight /></button>
    <section className="panel quote-history-card"><h2>报价记录</h2>{activeQuotes(property).length ? activeQuotes(property).slice().sort((a,b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)).map((item,index) => <div key={item.id}><span>{item.date || '日期待补'}</span><strong>{item.amount}万</strong><small>{index === 0 ? '当前' : index === activeQuotes(property).length - 1 ? '首次记录' : '上次记录'}</small></div>) : <p className="secondary">暂无报价记录</p>}</section>
    <div className="detail-bottom-actions"><Button variant="outline" onClick={onToggleCompare}>{selected ? '已加入对比' : '加入对比'}</Button><Button onClick={onQuote}>记录新报价</Button></div>
  </div>;
}

function PriceChart({ property }: { property: Property }) {
  const quotes = activeQuotes(property)
    .filter((q) => q.date)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    );
  if (!quotes.length)
    return <p className="secondary">添加有明确日期的报价后显示走势。</p>;
  const min = Math.min(...quotes.map((q) => q.amount)),
    max = Math.max(...quotes.map((q) => q.amount));
  const dates = quotes.map((q) => Date.parse(q.date));
  const start = Math.min(...dates),
    end = Math.max(...dates);
  const points = quotes.map((q, i) => ({
    x: end === start ? 160 : 40 + ((dates[i] - start) / (end - start)) * 250,
    y: 130 - ((q.amount - min) / (max - min || 1)) * 90,
    q,
  }));
  return (
    <>
      <svg
        viewBox="0 0 340 180"
        role="img"
        aria-label="挂牌总价走势图，单位万元"
      >
        <line x1="35" y1="140" x2="315" y2="140" stroke="#dce3ed" />
        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#17634c"
            strokeWidth="3"
          />
        )}
        {points.map((p) => (
          <g key={p.q.id}>
            <circle cx={p.x} cy={p.y} r="5" fill="#17634c" />
            <title>
              {p.q.date}：{p.q.amount}万元
            </title>
          </g>
        ))}
        <text x="10" y="22" fontSize="14" fill="#56647a">
          {max} 万元
        </text>
        <text x="35" y="165" fontSize="12">
          {quotes[0].date}
        </text>
        {quotes.length > 1 && (
          <text x="235" y="165" fontSize="12">
            {quotes.at(-1)?.date}
          </text>
        )}
      </svg>
      <p className="secondary">
        {quotes.length === 1
          ? '只有一条有日期的报价，继续记录后形成走势。'
          : '按报价日期展示，详细数值见历史记录。'}
      </p>
    </>
  );
}

function PropertyTable({
  properties,
  selected,
  setSelected,
  theme,
  onSort,
  onOpen,
}: {
  properties: Property[];
  selected: string[];
  setSelected: (v: string[]) => void;
  theme: string;
  onSort: (v: string) => void;
  onOpen: (p: Property) => void;
}) {
  return (
    <div className="data-grid mobile-grid">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>房源</TableHead>
            {theme === 'price' ? (
              <>
                <TableHead>
                  <button onClick={() => onSort('price')}>总价·万 ↑</button>
                </TableHead>
                <TableHead>
                  <button onClick={() => onSort('unit')}>单价·元/㎡ ↑</button>
                </TableHead>
              </>
            ) : theme === 'layout' ? (
              <>
                <TableHead>
                  <button onClick={() => onSort('area')}>
                    面积 / 实际面积 ↑
                  </button>
                </TableHead>
                <TableHead>户型</TableHead>
              </>
            ) : (
              <>
                <TableHead>楼层 / 朝向</TableHead>
                <TableHead>装修 / 电梯</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((p) => {
            const q = latestQuote(p);
            const floorArea = actualAreaSummary(
              p.area,
              p.floorPlan,
              p.actualArea,
            );
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="name-select">
                    <Checkbox
                      aria-label={`选择${p.name}`}
                      checked={selected.includes(p.id)}
                      onCheckedChange={(v) =>
                        setSelected(
                          v
                            ? Array.from(new Set([...selected, p.id]))
                            : selected.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <button className="property-name" onClick={() => onOpen(p)}>
                      {p.name}
                      <small>
                        {[p.layout, p.area ? `${p.area}㎡` : ''].filter(Boolean).join(' · ') ||
                          '资料待补'}
                      </small>
                      <small>{[p.floor, p.direction, p.decoration].filter(Boolean).join(' · ') || '区域、户型待补充'}</small>
                      {p.lift && <em>{p.lift === '是' ? '有电梯' : p.lift === '否' ? '无电梯' : p.lift}</em>}
                    </button>
                    {!!p.photos?.length && (
                      <span className="photo-link">看房照片 {p.photos.length}</span>
                    )}
                  </div>
                </TableCell>
                {theme === 'price' ? (
                  <>
                    <TableCell>
                      <span className="price-with-change">
                        <strong className="price-cell">
                          {q ? `${q.amount}万` : '—'}
                        </strong>
                        <PriceChange
                          value={priceSummary(p).totalDelta}
                          unit="万"
                        />
                      </span>
                      <small>{priceSummary(p).unit?.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) ?? '—'}元/㎡</small>
                    </TableCell>
                    <TableCell>
                      <button
                        className="trend-open"
                        aria-label={`查看${p.name}详情`}
                        onClick={() => onOpen(p)}
                      >
                        <MiniTrend property={p} />
                        <ChevronRight />
                      </button>
                    </TableCell>
                  </>
                ) : theme === 'layout' ? (
                  <>
                    <TableCell>
                      <div className="area-summary">
                        <strong>{p.area ? `${p.area}㎡` : '—'}</strong>
                        <small>
                          实际面积 {floorArea ? `${floorArea.total}㎡` : '—'}
                        </small>
                        <small>
                          得房率{' '}
                          {floorArea?.rate != null ? `${floorArea.rate}%` : '—'}
                        </small>
                      </div>
                    </TableCell>
                    <TableCell>{p.layout || '—'}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>
                      {p.floor || '—'}
                      <small>{p.direction || '朝向待补'}</small>
                    </TableCell>
                    <TableCell>
                      {p.decoration || '—'}
                      <small>{p.lift || '电梯待补'}</small>
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
function MiniTrend({ property }: { property: Property }) {
  const quotes = activeQuotes(property)
    .filter((quote) => quote.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (quotes.length < 2)
    return <span className="trend-placeholder"><i /><i /></span>;
  const min = Math.min(...quotes.map((quote) => quote.amount));
  const max = Math.max(...quotes.map((quote) => quote.amount));
  const points = quotes
    .map((quote, index) => `${6 + index * (88 / Math.max(1, quotes.length - 1))},${35 - ((quote.amount - min) / (max - min || 1)) * 26}`)
    .join(' ');
  const down = quotes[quotes.length - 1].amount < quotes[0].amount;
  return <svg className="mini-trend" viewBox="0 0 100 42" aria-hidden="true"><polyline points={points} fill="none" stroke={down ? '#15915d' : '#8491a5'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function Comparison({
  properties,
  onOpen,
  state,
  onManage,
  onRemove,
  onTrend,
}: {
  state: HouseState;
  properties: Property[];
  onOpen: (p: Property) => void;
  onManage: () => void;
  onRemove: (id: string) => void;
  onTrend: (mode: 'total' | 'unit' | 'community') => void;
}) {
  const [different, setDifferent] = useState(false);
  if (properties.length < 2) return <section className="compare-empty panel"><GitCompareArrows /><h2>{properties.length ? '还需要选择 1 套' : '还没有选择房源'}</h2><p>{properties.length ? `已选择“${properties[0].name}”，再选择一套即可开始对比。` : '至少选择两套房源后，才能查看价格和房屋信息差异。'}</p>{properties.map((property) => <div className="empty-selected" key={property.id}><button onClick={() => onOpen(property)}>{property.name}</button><button onClick={() => onRemove(property.id)}>移出</button></div>)}<Button onClick={onManage}>选择房源</Button></section>;
  const groups = [
    { title: '位置', rows: [
      { label: '小区 / 地址', values: properties.map((p) => p.name || '—') },
      { label: '区域', values: properties.map((p) => p.region || '—') },
      { label: '板块', values: properties.map((p) => p.district || '—') },
    ] },
    { title: '价格', rows: [
      { label: '总价（万）', trendMode: 'total' as const, values: properties.map((p) => String(latestQuote(p)?.amount ?? '—')) },
      { label: '单价（元/㎡）', trendMode: 'unit' as const, values: properties.map((p) => priceSummary(p).unit?.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) ?? '—') },
      { label: '报价日期', values: properties.map((p) => latestQuote(p)?.date || '待补') },
    ] },
    { title: '空间', rows: [
      { label: '建筑面积（㎡）', values: properties.map((p) => p.area || '—') },
      { label: '实际面积（㎡）', values: properties.map((p) => String(actualAreaSummary(p.area, p.floorPlan, p.actualArea)?.total ?? '—')) },
      { label: '得房率', values: properties.map((p) => { const rate = actualAreaSummary(p.area, p.floorPlan, p.actualArea)?.rate; return rate == null ? '—' : `${rate}%`; }) },
      { label: '户型', values: properties.map((p) => p.layout || '—') },
    ] },
    { title: '房屋信息', rows: [
      { label: '楼层', values: properties.map((p) => p.floor || '—') },
      { label: '朝向', values: properties.map((p) => p.direction || '—') },
      { label: '装修', values: properties.map((p) => p.decoration || '—') },
      { label: '电梯', values: properties.map((p) => p.lift === '是' ? '有电梯' : p.lift === '否' ? '无电梯' : '—') },
      { label: '建成年份', values: properties.map((p) => p.year || '—') },
      { label: '备注', values: properties.map((p) => p.note || '—') },
    ] },
    { title: '小区信息', rows: [{ label: '小区成交价', trendMode: 'community' as const, values: properties.map((p) => {
      const quote = communityForProperty(state, p)?.quotes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return quote ? `${quote.amount} ${quote.unit} · ${quote.kind} · ${quote.period || '时间待补'}` : '—';
    }) }] },
  ];
  const visibleGroups = groups.map((group) => ({ ...group, rows: group.rows.filter((row) => !different || new Set(row.values).size > 1) })).filter((group) => group.rows.length);
  const canOpenTrend = (mode: 'total' | 'unit' | 'community') => mode === 'community'
    ? properties.some((property) => communityForProperty(state, property)?.quotes.some((quote) => !!communityPeriod(quote.period)))
    : properties.some((property) => activeQuotes(property).some((quote) => !!quote.date));
  const colors = ['#17634c', '#8491a5', '#b58255', '#886c9b'];
  return <section className="comparison matrix-comparison">
    <label className="check-label"><Checkbox checked={different} onCheckedChange={(value) => setDifferent(!!value)} /><span><b>只看差异</b><small>隐藏内容相同的项目</small></span></label>
    <section className="compare-matrix-card"><div className="compare-matrix-scroll" role="region" aria-label="房源横向对比表，可左右滑动" tabIndex={0}><table className="compare-matrix">
      <thead><tr><th>对比项</th>{properties.map((property, index) => <th key={property.id} style={{ '--series-color': colors[index % colors.length] } as CSSProperties}><div className="matrix-property-heading"><i /><button onClick={() => onOpen(property)}><strong>{property.name}</strong><span>{latestQuote(property)?.amount ?? '—'}万</span></button><button className="matrix-remove" aria-label={`移除${property.name}`} onClick={() => onRemove(property.id)}><Trash2 /></button></div></th>)}</tr></thead>
      <tbody>{visibleGroups.map((group) => <Fragment key={group.title}><tr className="compare-section-row"><th scope="rowgroup">{group.title}</th><td colSpan={properties.length} aria-hidden="true" /></tr>{group.rows.map((row) => <tr key={row.label} className={new Set(row.values).size > 1 ? 'is-different' : ''}><th><span>{row.label}</span>{row.trendMode && canOpenTrend(row.trendMode) && <button className="matrix-trend-link" onClick={() => onTrend(row.trendMode)}><Search />查看走势</button>}</th>{properties.map((property, index) => <td key={property.id}><span>{row.values[index]}</span></td>)}</tr>)}</Fragment>)}</tbody>
    </table></div></section>
    {!visibleGroups.length && <p className="secondary">当前记录的信息没有差异。</p>}
  </section>;
}

function CompareTrendDetail({ state, properties, mode }: { state: HouseState; properties: Property[]; mode: 'total' | 'unit' | 'community' }) {
  if (mode === 'community') {
    const communities = Array.from(new Map(properties.map((property) => communityForProperty(state, property)).filter((community): community is Community => !!community).map((community) => [community.id, community])).values());
    const totalSeries = communities.map((community) => communityAsProperty(community, '万元')).filter((property) => property.quotes.length);
    const unitSeries = communities.map((community) => communityAsProperty(community, '元/㎡')).filter((property) => property.quotes.length);
    return <section className="compare-trend-page"><section className="panel compare-trend-summary"><span>当前对比范围</span><h2>{communities.length} 个关联小区</h2><p>展示已录入的小区成交价历史</p></section>{totalSeries.length > 0 && <section className="panel compare-trend-chart"><h2>成交总价走势</h2><CompareChart properties={totalSeries} metric="total" unitLabel="成交总价 · 万元" /></section>}{unitSeries.length > 0 && <section className="panel compare-trend-chart"><h2>成交单价走势</h2><CompareChart properties={unitSeries} metric="total" unitLabel="成交单价 · 元/㎡" /></section>}{!totalSeries.length && !unitSeries.length && <section className="panel"><p className="secondary">暂无带时间的小区成交价记录。</p></section>}</section>;
  }
  return <section className="compare-trend-page"><section className="panel compare-trend-summary"><span>当前对比范围</span><h2>{properties.length} 套房源</h2><p>{mode === 'total' ? '全部对比房源的总价趋势' : '全部对比房源的单价趋势'}</p></section><section className="panel compare-trend-chart"><CompareChart properties={properties} metric={mode} emptyText="至少添加一条带日期的报价后显示走势" /></section></section>;
}
function communityPeriod(value: string) {
  const match = value.match(/(20\d{2})[年/.-](\d{1,2})(?:[月/.-](\d{1,2}))?/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${(match[3] || '01').padStart(2, '0')}`;
}
function communityAsProperty(
  community: Community,
  unit: '万元' | '元/㎡',
): Property {
  return {
    ...newProperty(),
    id: community.id,
    name: community.name,
    quotes: community.quotes
      .filter((quote) => quote.unit === unit && communityPeriod(quote.period))
      .map((quote) => ({
        id: quote.id,
        amount: quote.amount,
        date: communityPeriod(quote.period),
        createdAt: quote.createdAt,
        note: quote.kind,
      })),
  };
}
function CompareChart({
  properties,
  metric,
  unitLabel,
  emptyText = '暂无走势数据',
}: {
  properties: Property[];
  metric: string;
  unitLabel?: string;
  emptyText?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const palette = ['#17634c', '#8491a5', '#b58255', '#886c9b', '#3f7c83', '#a45f56'];
  const series = properties.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: palette[i % palette.length],
    points: activeQuotes(p)
      .filter(() => metric === 'total' || Number(p.area) > 0)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.createdAt.localeCompare(b.createdAt),
      )
      .map((q) => ({
        id: q.id,
        date: q.date,
        time: q.date ? Date.parse(q.date) : Date.parse(q.createdAt),
        value:
          metric === 'total' ? q.amount : (q.amount * 10000) / Number(p.area),
      })),
  }));
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <p className="secondary">{emptyText}</p>;
  const dates = Array.from(new Set(all.map((q) => q.time))).sort(
    (a, b) => a - b,
  );
  const selected =
    picked !== null && dates.includes(picked)
      ? picked
      : dates[dates.length - 1];
  const hasDatedPoint = all.some((q) => q.date);
  const min = Math.min(...all.map((q) => q.value)),
    max = Math.max(...all.map((q) => q.value));
  const padding = Math.max((max - min) * 0.18, max * 0.015, 1);
  const low = Math.max(0, min - padding),
    high = max + padding;
  const x = (time: number) =>
    dates.length === 1
      ? 276
      : 64 + ((time - dates[0]) / (dates[dates.length - 1] - dates[0])) * 424;
  const y = (value: number) => 218 - ((value - low) / (high - low)) * 178;
  const format = (value: number) =>
    value.toLocaleString('zh-CN', {
      maximumFractionDigits: metric === 'total' ? 2 : 0,
    });
  const dateLabel = (time: number) => new Date(time).toISOString().slice(0, 10);
  const pointLabel = (time: number) =>
    all.find((q) => q.time === time)?.date || '时间待补';
  const ticks = Array.from(
    new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]),
  ).map((i) => dates[i]);
  const activeIndex = dates.indexOf(selected);
  return (
    <div className="price-chart">
      <div className="chart-topline">
        <span>
          {unitLabel || (metric === 'total' ? '总价 · 万元' : '单价 · 元/㎡')}
        </span>
        <span>
          {hasDatedPoint
            ? `${dateLabel(dates[0]).slice(0, 7)} — ${dateLabel(dates[dates.length - 1]).slice(0, 7)}`
            : '时间待补'}
        </span>
      </div>
      <svg
        className="trend-svg"
        viewBox="0 0 520 260"
        role="group"
        aria-label="报价走势，点击节点查看数据"
      >
        {[0, 1, 2, 3].map((i) => {
          const value = low + ((high - low) * i) / 3;
          return (
            <g key={i}>
              <line
                x1="64"
                x2="488"
                y1={y(value)}
                y2={y(value)}
                stroke="#e8edf4"
                strokeDasharray="3 5"
              />
              <text
                x="54"
                y={y(value) + 4}
                textAnchor="end"
                className="chart-axis"
              >
                {value.toLocaleString('zh-CN', {
                  maximumFractionDigits: metric === 'total' ? 1 : 0,
                })}
              </text>
            </g>
          );
        })}
        {ticks.map((time) => (
          <text
            key={time}
            x={x(time)}
            y="244"
            textAnchor="middle"
            className="chart-axis"
          >
            {pointLabel(time) === '时间待补'
              ? pointLabel(time)
              : dateLabel(time).slice(5).replace('-', '/')}
          </text>
        ))}
        <line
          x1={x(selected)}
          x2={x(selected)}
          y1="28"
          y2="220"
          stroke="#a6b7ce"
          strokeDasharray="4 5"
        />
        {series.map((s) => (
          <g key={s.id}>
            {s.points.length > 1 && (
              <polyline
                points={s.points
                  .map((q) => `${x(q.time)},${y(q.value)}`)
                  .join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {s.points.map((q) => (
              <g key={q.id}>
                {q.time === selected && (
                  <circle
                    cx={x(q.time)}
                    cy={y(q.value)}
                    r="10"
                    fill={s.color}
                    opacity=".13"
                  />
                )}
                <circle
                  cx={x(q.time)}
                  cy={y(q.value)}
                  r={s.points.length === 1 || q.time === selected ? 5 : 3.5}
                  fill="white"
                  stroke={s.color}
                  strokeWidth="2.5"
                />
                {s.points.length === 1 && (
                  <text
                    x={x(q.time) + 10}
                    y={y(q.value) - 10}
                    className="chart-single-point-label"
                  >
                    {format(q.value)}
                  </text>
                )}
              </g>
            ))}
          </g>
        ))}
        {dates.map((time) => (
          <g
            key={time}
            role="button"
            tabIndex={0}
            aria-label={`查看${dateLabel(time)}的报价`}
            aria-pressed={time === selected}
            onClick={() => setPicked(time)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setPicked(time);
              }
            }}
            className="chart-hit"
          >
            <rect
              x={Math.max(60, x(time) - 22)}
              y="24"
              width="44"
              height="200"
              fill="transparent"
            />
          </g>
        ))}
      </svg>
      <div className="chart-detail">
        <div className="chart-date-nav">
          <Button
            variant="ghost"
            aria-label="上一个报价日期"
            disabled={activeIndex === 0}
            onClick={() => setPicked(dates[activeIndex - 1])}
          >
            ‹
          </Button>
          <strong>
            {pointLabel(selected) === '时间待补'
              ? pointLabel(selected)
              : dateLabel(selected)}
          </strong>
          <Button
            variant="ghost"
            aria-label="下一个报价日期"
            disabled={activeIndex === dates.length - 1}
            onClick={() => setPicked(dates[activeIndex + 1])}
          >
            ›
          </Button>
        </div>
        <div aria-live="polite">
          {series.map((s) => (
            <div className="chart-value-row" key={s.id}>
              <span className="chart-series-name">
                <i style={{ background: s.color }} />
                {s.name}
              </span>
              <strong>
                {s.points
                  .filter((q) => q.time === selected)
                  .map((q) => format(q.value))
                  .join(' / ') || '—'}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PriceChange({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) return null;
  const digits = unit === '万' ? 2 : 0;
  const rounded = Number(value.toFixed(digits));
  if (!rounded)
    return (
      <span className="price-change flat" aria-label="持平">
        −
      </span>
    );
  const amount = Math.abs(rounded).toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
  });
  return (
    <span
      className={`price-change ${rounded > 0 ? 'up' : 'down'}`}
      title={`相比上一条有效报价${rounded > 0 ? '上涨' : '下降'} ${amount}${unit}`}
      aria-label={`${rounded > 0 ? '上涨' : '下降'}${amount}${unit}`}
    >
      {rounded > 0 ? '↑' : '↓'} {amount}
    </span>
  );
}
