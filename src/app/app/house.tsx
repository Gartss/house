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

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  LOCATION_DATA,
  LOCATION_DISTRICTS,
  LOCATION_REGIONS,
} from '@/lib/location-data';
import BulkReview from './bulk-review';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  ArrowLeft,
  Upload,
  Search,
  MoreHorizontal,
  House as HouseIcon,
} from 'lucide-react';
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export default function HouseApp() {
  const [state, setState] = useState<HouseState>(emptyState());
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importProgressLabel, setImportProgressLabel] = useState('');
  const [page, setPage] = useState('list');
  const [edit, setEdit] = useState<Property | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [theme, setTheme] = useState('price');
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
  const [minUnit, setMinUnit] = useState('');
  const [maxUnit, setMaxUnit] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [layoutFilter, setLayoutFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const mutex = useRef(false);
  async function load() {
    try {
      const r = await fetch('/api/state');
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setState(d.state);
      setVersion(d.version);
      setReady(true);
    } catch (e) {
      setMessage(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(next: HouseState, deletedPropertyIds: string[] = []) {
    if (mutex.current) return false;
    mutex.current = true;
    setBusy(true);
    try {
      const requestId = newId();
      const send = () =>
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: next,
            version,
            requestId,
            deletedPropertyIds,
          }),
        });
      let r;
      try {
        r = await send();
      } catch {
        r = await send();
      }
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setVersion(d.version);
      setState(next);
      setMessage('');
      return true;
    } catch (e) {
      setMessage(`${String(e)}。未确认保存，请保留当前页面。`);
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
    setPage('detail');
  }
  async function saveProperty() {
    if (!edit || !edit.name.trim()) {
      setMessage('请填写小区 / 地址');
      return;
    }
    const next = copy(state);
    const i = next.properties.findIndex((p) => p.id === edit.id);
    if (i < 0) next.properties.push(edit);
    else next.properties[i] = edit;
    if (await save(next)) setPage('list');
  }
  async function addQuote() {
    if (!edit || !Number(price) || Number(price) <= 0) {
      setMessage('请填写有效总价');
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
      setMessage('请先保存房源资料');
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
    const fileList = Array.from(files);
    const totalFiles = fileList.length;
    let currentFileIndex = 0;
    let phaseStart = 0.1;
    let phaseSpan = 0.55;
    const updateImportProgress = (localProgress: number, label: string) => {
      const value = Math.min(
        99,
        Math.round(((currentFileIndex + localProgress) / totalFiles) * 100),
      );
      setImportProgress(value);
      setImportProgressLabel(label);
    };
    setBusy(true);
    setImportProgress(0);
    setImportProgressLabel(
      totalFiles === 1 ? '准备导入图片' : `准备导入 ${totalFiles} 张图片`,
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
            setMessage(`识别中 ${Math.round(m.progress * 100)}%`);
        },
      });
      try {
        for (const [index, file] of fileList.entries()) {
          currentFileIndex = index;
          updateImportProgress(0.02, `正在上传第 ${index + 1}/${totalFiles} 张`);
          if (file.size > 12 * 1024 * 1024) throw Error('图片需小于12MB');
          const r = await fetch('/api/images', {
            method: 'POST',
            headers: { 'Content-Type': file.type },
            body: file,
          });
          if (!r.ok) throw Error(await r.text());
          updateImportProgress(0.08, `正在读取第 ${index + 1}/${totalFiles} 张`);
          const { id } = (await r.json()) as { id: string };
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
          let text = '';
          try {
            phaseStart = 0.1;
            phaseSpan = 0.55;
            text = (await worker.recognize(file)).data.text;
            updateImportProgress(0.65, `已识别第 ${index + 1}/${totalFiles} 张`);
          } catch {
            setMessage('识别未完成，已保留原图，可手动填写');
          }
          const { parseScreenshot } = await import('@/lib/ocr');
          const properties = parseScreenshot(text, id);
          if (
            properties.length === 1 &&
            ((!properties[0].area || Number(properties[0].area) < 10) ||
              (!properties[0].lift && /电梯/.test(text)) ||
              (!properties[0].layout && /(?:户型|室[\s\S]*厅)/.test(text)))
          ) {
            try {
              phaseStart = 0.65;
              phaseSpan = 0.13;
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
                phaseStart = 0.78;
                phaseSpan = 0.17;
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
              phaseStart = 0.78;
              phaseSpan = 0.17;
              const { recognizeFloorPlan } =
                await import('@/lib/floorplan-ocr');
              properties[0].floorPlan = await recognizeFloorPlan(
                worker,
                file,
                id,
                text,
              );
            } catch {
              setMessage('户型面积未完整识别，请在核对页补充。');
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
        setImportProgress(99);
        setImportProgressLabel('正在合并房源信息');
        next = mergeImportedDrafts(next);
      } finally {
        await worker.terminate();
      }
      const saved = await save(next);
      if (saved) {
        setImportProgress(100);
        setImportProgressLabel('导入完成');
      }
      return saved ? next : undefined;
    } catch (e) {
      setBusy(false);
      if (next.drafts.length > state.drafts.length)
        return (await save(next)) ? next : undefined;
      setMessage(`导入未全部完成：${String(e)}。可重新选择截图重试。`);
      return undefined;
    } finally {
      setBusy(false);
      setImportProgress(null);
      setImportProgressLabel('');
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
      const images: Record<string, string> = {};
      let bytes = 0;
      for (const id of ids) {
        const r = await fetch(`/api/images/${id}`);
        if (!r.ok) throw Error('原图读取失败');
        const b = await r.blob();
        bytes += b.size;
        if (bytes > 30 * 1024 * 1024)
          throw Error('备份图片超过首版30MB限制，请联系维护者处理');
        images[id] = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = reject;
          fr.readAsDataURL(b);
        });
      }
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
      setMessage(String(e));
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
        const blob = await (await fetch(url)).blob();
        const r = await fetch('/api/images', { method: 'POST', body: blob });
        if (!r.ok) throw Error('图片恢复失败');
        if (((await r.json()) as { id: string }).id !== id)
          throw Error('备份图片校验失败');
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
      setMessage(`恢复失败：${String(e)}`);
    } finally {
      setBusy(false);
      if (backupInput.current) backupInput.current.value = '';
    }
  }
  const visible = state.properties
    .filter(
      (p) =>
        [p.name, p.layout, p.note, p.region, p.district]
          .join(' ')
          .includes(query) &&
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
      sort === 'price'
        ? (latestQuote(a)?.amount || Infinity) -
          (latestQuote(b)?.amount || Infinity)
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

  const form = edit && (
    <div className="edit-grid">
      {fields
        .filter(([key]) => key === 'name')
        .map(([key, label]) => (
          <label className="wide" key={key}>
            {label}
            <Input
              disabled={busy}
              value={edit[key] || ''}
              onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
            />
          </label>
        ))}
      <div className="location-pair">
        {fields
          .filter(([key]) => key === 'region' || key === 'district')
          .map(([key, label]) => (
            <label key={key}>
              {label}
              {key === 'region' || key === 'district' ? (
                <select
                  className="location-select"
                  disabled={busy}
                  value={edit[key] || ''}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      [key]: e.target.value,
                      ...(key === 'region' ? { district: '' } : {}),
                    })
                  }
                >
                  <option value="">请选择{label}</option>
                  {(key === 'region'
                    ? LOCATION_REGIONS
                    : edit.region
                      ? LOCATION_DATA[edit.region] || LOCATION_DISTRICTS
                      : LOCATION_DISTRICTS
                  ).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  disabled={busy}
                  value={edit[key] || ''}
                  onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                />
              )}
            </label>
          ))}
      </div>
      {fields
        .filter(([key]) => !['name', 'region', 'district'].includes(key))
        .map(([key, label]) => (
          <label className={key === 'note' ? 'wide' : undefined} key={key}>
            {label}
            <PropertyFieldControl
              field={key}
              label={label}
              disabled={busy}
              value={edit[key] || ''}
              onChange={(value) => setEdit({ ...edit, [key]: value })}
            />
          </label>
        ))}
    </div>
  );
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
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
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
  return (
    <main className="house-shell">
      <div className="utility-bar">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" aria-label="更多操作" />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="utility-menu">
            <DropdownMenuItem
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.reload();
              }}
            >
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={backupInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => restore(e.target.files?.[0])}
        />
      </div>
      {(busy || (message && message !== '已保存')) && (
        <div className="status" role="status">
          {busy && importProgress !== null ? (
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
          ) : (
            <>
              {busy ? '处理中，请稍候… ' : ''}
              {message === '已保存' ? '' : message}
            </>
          )}
        </div>
      )}
      {!ready ? (
        <section className="welcome">
          <p>正在读取房源…</p>
          <Button onClick={load}>重新读取</Button>
        </section>
      ) : (
        <>
          {page !== 'list' && (
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
                  setPage('list');
                }}
              >
                <ArrowLeft />
                返回房源
              </Button>
              {page === 'detail' && edit && (
                <Button disabled={busy} onClick={saveProperty}>
                  保存
                </Button>
              )}
            </div>
          )}
          {page === 'list' && (
            <>
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => importImages(e.target.files)}
              />
              <div className="search">
                <Search size={18} />
                <Input
                  aria-label="搜索小区、户型或备注"
                  placeholder="搜索小区、户型或备注"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="chips">
                {[
                  ['', '默认'],
                  ['price', '总价↑'],
                  ['area', '面积↑'],
                  ['unit', '单价↑'],
                  ['date', '最新报价'],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    variant={sort === value ? 'default' : 'outline'}
                    onClick={() => setSort(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <details className="filter-panel">
                <summary>筛选</summary>
                <div className="compact-filters">
                  <label>
                    区域
                    <select
                      className="location-select"
                      value={regionFilter}
                      onChange={(e) => {
                        setRegionFilter(e.target.value);
                        setDistrictFilter('');
                      }}
                    >
                      <option value="">全部区域</option>
                      {Array.from(
                        new Set(
                          state.properties.map((p) => p.region).filter(Boolean),
                        ),
                      )
                        .sort()
                        .map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    板块
                    <select
                      className="location-select"
                      value={districtFilter}
                      onChange={(e) => setDistrictFilter(e.target.value)}
                    >
                      <option value="">全部板块</option>
                      {Array.from(
                        new Set(
                          state.properties
                            .filter(
                              (p) => !regionFilter || p.region === regionFilter,
                            )
                            .map((p) => p.district)
                            .filter(Boolean),
                        ),
                      )
                        .sort()
                        .map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    总价上限（万元）
                    <Input
                      inputMode="decimal"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                    />
                  </label>
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
                        <small role="alert">最低面积不能大于最高面积</small>
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
                        <small role="alert">最低单价不能大于最高单价</small>
                      )}
                  </div>
                  <label>
                    户型
                    <select
                      className="location-select"
                      value={layoutFilter}
                      onChange={(e) => setLayoutFilter(e.target.value)}
                    >
                      <option value="">全部户型</option>
                      {Array.from(
                        new Set(
                          state.properties
                            .map((p) => p.layout.replace(/\s/g, ''))
                            .filter(Boolean),
                        ),
                      )
                        .sort((a, b) =>
                          a.localeCompare(b, 'zh-CN', { numeric: true }),
                        )
                        .map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('');
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
                  清除筛选
                </Button>
              </details>
              {state.drafts.length > 0 && (
                <button
                  className="review-entry"
                  disabled={busy}
                  onClick={() => setPage('review')}
                >
                  <span>
                    待核对{' '}
                    <strong>
                      {state.drafts.reduce(
                        (n, d) => n + d.properties.length,
                        0,
                      )}
                    </strong>
                  </span>
                  <span>打开核对表 →</span>
                </button>
              )}
              <div className="view-tools">
                <div className="theme-tabs" aria-label="表格主题">
                  {[
                    ['price', '价格'],
                    ['layout', '户型'],
                    ['features', '楼层装修'],
                  ].map(([id, label]) => (
                    <Button
                      key={id}
                      variant={theme === id ? 'default' : 'ghost'}
                      aria-pressed={theme === id}
                      onClick={() => setTheme(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <Button
                  disabled={selected.length < 2}
                  onClick={() => setPage('compare')}
                >
                  对比
                </Button>
              </div>
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
                <PropertyTable
                  theme={theme}
                  onSort={setSort}
                  properties={visible}
                  selected={selected}
                  setSelected={setSelected}
                  onOpen={open}
                />
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
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEdit(newProperty());
                    resetForm();
                    setPage('detail');
                  }}
                >
                  <Plus />
                  新增
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload />
                  相册导入
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
            />
          )}
          {page === 'detail' && edit && (
            <>
              <section className="panel">
                <h1>{edit.name || '新增房源'}</h1>
                {form}
              </section>
              {state.properties.some((p) => p.id === edit.id) && (
                <section className="panel">
                  <h2>历史报价</h2>
                  {priceForm}
                  <Button disabled={busy} onClick={addQuote}>
                    添加报价
                  </Button>
                  {edit.quotes.length === 0 && (
                    <p className="secondary">还没有报价记录</p>
                  )}
                  {edit.quotes
                    .slice()
                    .reverse()
                    .map((q) => (
                      <div className="quote-row" key={q.id}>
                        <div>
                          <strong>{q.amount} 万元</strong>
                          <p>{q.date || '日期待补'}</p>
                          {q.note && <p>{q.note}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => deleteQuote(q.id)}
                        >
                          删除
                        </Button>
                      </div>
                    ))}
                </section>
              )}
              <PropertyExtras
                key={edit.id}
                property={edit}
                onChange={setEdit}
                state={state}
                onSave={save}
                busy={busy}
                onBusy={setBusy}
                onMessage={setMessage}
              />
              {state.properties.some((p) => p.id === edit.id) && (
                <>
                  <section className="panel">
                    <h2>价格走势</h2>
                    <CompareChart properties={[edit]} metric="total" />
                  </section>
                  <section className="panel">
                    <h2>来源截图</h2>
                    {edit.images.length ? (
                      edit.images.map((id) => (
                        <a
                          key={id}
                          href={`/api/images/${id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            className="source-thumb"
                            src={`/api/images/${id}`}
                            alt="房源原始截图"
                          />
                        </a>
                      ))
                    ) : (
                      <p className="secondary">暂无截图</p>
                    )}
                    <Button
                      className="delete-property"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => deleteProperties([edit.id])}
                    >
                      删除房源
                    </Button>
                  </section>
                </>
              )}
            </>
          )}
          {page === 'review' && (
            <BulkReview
              state={state}
              busy={busy}
              ask={ask}
              onMessage={setMessage}
              onSave={save}
              onReupload={(files) => importImages(files, true)}
              onDone={() => setPage('list')}
            />
          )}
        </>
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
            stroke="#1859df"
            strokeWidth="3"
          />
        )}
        {points.map((p) => (
          <g key={p.q.id}>
            <circle cx={p.x} cy={p.y} r="5" fill="#1859df" />
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
  onOpen,
  theme,
  onSort,
}: {
  properties: Property[];
  selected: string[];
  setSelected: (v: string[]) => void;
  onOpen: (p: Property) => void;
  theme: string;
  onSort: (v: string) => void;
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
                        {[p.layout, p.floor].filter(Boolean).join(' · ') ||
                          '资料待补'}
                      </small>
                    </button>
                    {!!p.photos?.length && (
                      <a
                        className="photo-link"
                        href={`/api/images/${p.photos[0]}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        看房照片 {p.photos.length}
                      </a>
                    )}
                  </div>
                </TableCell>
                {theme === 'price' ? (
                  <>
                    <TableCell>
                      <span className="price-with-change">
                        <strong className="price-cell">
                          {q?.amount ?? '—'}
                        </strong>
                        <PriceChange
                          value={priceSummary(p).totalDelta}
                          unit="万"
                        />
                      </span>
                      <small>{q?.date || '日期待补'}</small>
                    </TableCell>
                    <TableCell>
                      <span className="price-with-change">
                        <span>
                          {priceSummary(p).unit?.toLocaleString('zh-CN', {
                            maximumFractionDigits: 0,
                          }) ?? '—'}
                        </span>
                        <PriceChange
                          value={priceSummary(p).unitDelta}
                          unit="元/㎡"
                        />
                      </span>
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
function Comparison({
  properties,
  onOpen,
  state,
}: {
  state: HouseState;
  properties: Property[];
  onOpen: (p: Property) => void;
}) {
  const [different, setDifferent] = useState(false);
  const [metric, setMetric] = useState('total');
  if (properties.length < 2) return <p>请至少选择两套房源进行对比。</p>;
  const communities = Array.from(
    new Map(
      properties
        .map((property) => communityForProperty(state, property))
        .filter((community): community is Community => !!community)
        .map((community) => [community.id, community]),
    ).values(),
  );
  const rows = [
    {
      label: '实际面积（㎡）',
      values: properties.map((p) =>
        String(
          actualAreaSummary(p.area, p.floorPlan, p.actualArea)?.total ?? '—',
        ),
      ),
    },
    {
      label: '得房率',
      values: properties.map((p) => {
        const rate = actualAreaSummary(p.area, p.floorPlan, p.actualArea)?.rate;
        return rate == null ? '—' : `${rate}%`;
      }),
    },
    {
      label: '小区成交价',
      values: properties.map((p) => {
        const q = communityForProperty(state, p)
          ?.quotes.slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return q
          ? `${q.amount} ${q.unit} · ${q.kind} · ${q.period || '时间待补'}`
          : '—';
      }),
    },
    {
      label: '总价（万）',
      values: properties.map((p) => String(latestQuote(p)?.amount ?? '—')),
    },
    {
      label: '当前单价（元/㎡）',
      values: properties.map(
        (p) =>
          priceSummary(p).unit?.toLocaleString('zh-CN', {
            maximumFractionDigits: 0,
          }) ?? '—',
      ),
    },
    {
      label: '报价日期',
      values: properties.map((p) => latestQuote(p)?.date || '待补'),
    },
    ...fields
      .filter(([k]) => k !== 'name')
      .map(([k, label]) => ({
        label,
        values: properties.map((p) => p[k] || '—'),
      })),
  ];
  const shown = rows.filter((r) => !different || new Set(r.values).size > 1);
  return (
    <section className="comparison">
      <h1>房源对比 · 已选 {properties.length} 套</h1>
      <label className="check-label">
        <Checkbox
          checked={different}
          onCheckedChange={(v) => setDifferent(!!v)}
        />
        只看差异
      </label>
      <div
        className="comparison-scroll"
        role="region"
        aria-label="房源对比表，可左右滑动"
        tabIndex={0}
      >
        <table className="column-comparison">
          <thead>
            <tr>
              <th scope="col">指标</th>
              {properties.map((p, i) => (
                <th scope="col" key={p.id}>
                  <button onClick={() => onOpen(p)}>
                    {i + 1}. {p.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ label, values }) => (
              <tr
                key={label}
                className={new Set(values).size > 1 ? 'is-different' : ''}
              >
                <th scope="row">{label}</th>
                {properties.map((p, i) => (
                  <td key={p.id}>
                    <span className="price-with-change">
                      {values[i]}
                      {label === '总价（万）' && (
                        <PriceChange
                          value={priceSummary(p).totalDelta}
                          unit="万"
                        />
                      )}
                      {label === '当前单价（元/㎡）' && (
                        <PriceChange
                          value={priceSummary(p).unitDelta}
                          unit="元/㎡"
                        />
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="secondary">已记录字段没有差异。</p>}
      <section className="panel">
        <h2>报价走势 · 全部所选房源</h2>
        <div className="chips">
          <Button
            variant={metric === 'total' ? 'default' : 'outline'}
            onClick={() => setMetric('total')}
          >
            总价
          </Button>
          <Button
            variant={metric === 'unit' ? 'default' : 'outline'}
            onClick={() => setMetric('unit')}
          >
            单价
          </Button>
        </div>
        <CompareChart properties={properties} metric={metric} />
      </section>
      {communities.some((community) => community.quotes.length) && (
        <section className="panel">
          <h2>小区成交价走势</h2>
          <p className="secondary">
            同一小区只显示一次，共 {communities.length} 个关联小区。
          </p>
          {(['万元', '元/㎡'] as const).map((unit) => {
            const series = communities
              .map((community) => communityAsProperty(community, unit))
              .filter((property) => property.quotes.length);
            return series.length ? (
              <div className="community-trend" key={unit}>
                <CompareChart
                  properties={series}
                  metric="total"
                  unitLabel={unit}
                  emptyText="暂无带日期的小区成交价"
                />
              </div>
            ) : null;
          })}
        </section>
      )}
    </section>
  );
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
  const palette = [
    '#2563eb',
    '#e07832',
    '#8b5cf6',
    '#0891b2',
    '#db2777',
    '#43864b',
  ];
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
