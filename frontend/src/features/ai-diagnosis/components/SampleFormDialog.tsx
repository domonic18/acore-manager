import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import type { SampleEvidence, SampleInput, SampleItem } from '../api/ai-diagnosis.api';
import { useCreateSample, useUpdateSample } from '../hooks/useAiDiagnosis';

// 样本库表单弹窗：新增/编辑巡查样本（goodcase/badcase 标注语料）。
// evidence 输入格式：每行 `来源 | 摘录`（如 parse_anticheat_violations | Speed Movement at 48073%）。

const LABELS: { value: SampleItem['label']; label: string }[] = [
  { value: 'pending', label: '待定' },
  { value: 'cheat', label: '确认作弊' },
  { value: 'false_positive', label: '确认误报' },
];

const SOURCES: { value: SampleItem['source']; label: string }[] = [
  { value: 'auto_ban', label: '模块自动封禁' },
  { value: 'appeal', label: '申诉结论' },
  { value: 'deep_analysis', label: '深度分析' },
  { value: 'inspection', label: '巡检' },
  { value: 'gm', label: 'GM 录入' },
];

interface SampleFormDialogProps {
  editing: SampleItem | null;
  open: boolean;
  onClose: () => void;
}

function parseEvidence(text: string): SampleEvidence[] | null {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const items: SampleEvidence[] = [];
  for (const line of lines) {
    const sep = line.indexOf('|');
    if (sep <= 0) return null;
    const source = line.slice(0, sep).trim();
    const quote = line.slice(sep + 1).trim();
    if (!source || !quote) return null;
    items.push({ source, quote });
  }
  return items;
}

export function SampleFormDialog({ editing, open, onClose }: SampleFormDialogProps) {
  const create = useCreateSample();
  const update = useUpdateSample();
  const [realm, setRealm] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [characterGuid, setCharacterGuid] = useState('');
  const [label, setLabel] = useState<SampleItem['label']>('pending');
  const [source, setSource] = useState<SampleItem['source']>('gm');
  const [detectedDate, setDetectedDate] = useState('');
  const [summary, setSummary] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [refUrl, setRefUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setRealm(editing.realm);
      setCharacterName(editing.characterName);
      setCharacterGuid(editing.characterGuid?.toString() ?? '');
      setLabel(editing.label);
      setSource(editing.source);
      setDetectedDate(editing.detectedDate ?? '');
      setSummary(editing.summary);
      setEvidenceText((editing.evidenceJson ?? []).map((e) => `${e.source} | ${e.quote}`).join('\n'));
      setRefUrl(editing.refUrl ?? '');
    } else {
      setRealm('');
      setCharacterName('');
      setCharacterGuid('');
      setLabel('pending');
      setSource('gm');
      setDetectedDate('');
      setSummary('');
      setEvidenceText('');
      setRefUrl('');
    }
  }, [open, editing]);

  const submitting = create.isPending || update.isPending;
  const canSubmit = realm.trim() !== '' && characterName.trim() !== '' && summary.trim().length >= 2 && !submitting;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    const evidence = parseEvidence(evidenceText);
    if (evidence === null) {
      toast.error('证据摘录格式错误：每行须为「来源 | 摘录」');
      return;
    }
    const input: SampleInput = {
      realm: realm.trim(),
      characterName: characterName.trim(),
      characterGuid: characterGuid.trim() === '' ? null : Number(characterGuid),
      label,
      source,
      detectedDate: detectedDate.trim() === '' ? null : detectedDate.trim(),
      summary: summary.trim(),
      evidence,
      refUrl: refUrl.trim() === '' ? null : refUrl.trim(),
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: input });
        toast.success('样本已更新');
      } else {
        await create.mutateAsync(input);
        toast.success('样本已录入');
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message || '提交失败');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `编辑样本：${editing.characterName}` : '录入巡查样本'}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">角色名（必填）</label>
          <input
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">角色 GUID（可选）</label>
          <input
            value={characterGuid}
            onChange={(e) => setCharacterGuid(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">服务器（必填）</label>
          <input
            value={realm}
            onChange={(e) => setRealm(e.target.value)}
            placeholder="如 realm3"
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">发现日期（可选）</label>
          <input
            type="date"
            value={detectedDate}
            onChange={(e) => setDetectedDate(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">标注</label>
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value as SampleItem['label'])}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          >
            {LABELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">来源</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SampleItem['source'])}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">摘要（必填，特征与判定依据）</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="如：STSM continuous burst（zaxis58+teleportplane41）+ 极端超速 + Time Manipulation 反制"
            className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">证据摘录（可选，每行「来源 | 摘录」）</label>
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            rows={3}
            placeholder={'parse_anticheat_violations | Speed Movement at 48073.02% above allowed Server Set rate 16.8%'}
            className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">引用链接（可选，如论坛申诉帖）</label>
          <input
            value={refUrl}
            onChange={(e) => setRefUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </Dialog>
  );
}
