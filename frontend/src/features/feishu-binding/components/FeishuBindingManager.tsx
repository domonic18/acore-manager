import { FormEvent, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from '@/shared/utils/toast.util';
import { Skeleton } from '@/shared/components/Skeleton';
import {
  useCreateFeishuBinding,
  useFeishuBindings,
  useRemoveFeishuBinding,
} from '../hooks/useFeishuBindings';
import type { FeishuBinding } from '../api/feishu-binding.api';

const inputClass =
  'w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const labelClass = 'mb-1 block text-sm font-medium';

function CreateBindingForm() {
  const create = useCreateFeishuBinding();
  const [openId, setOpenId] = useState('');
  const [feishuName, setFeishuName] = useState('');
  const [acUsername, setAcUsername] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const created = await create.mutateAsync({
        feishuOpenId: openId.trim(),
        feishuName: feishuName.trim() || undefined,
        acUsername: acUsername.trim(),
      });
      toast.success(`已绑定：${created.feishuName || created.feishuOpenId} → ${created.acUsername}`);
      setOpenId('');
      setFeishuName('');
      setAcUsername('');
    } catch (err) {
      toast.error((err as Error).message || '绑定失败');
    }
  };

  return (
    <form onSubmit={handleSubmit} className='rounded-lg border border-border bg-card p-4 space-y-3'>
      <h2 className='text-base font-semibold'>新增绑定</h2>
      <p className='text-xs text-muted-foreground'>
        open_id 从飞书开放平台「获取用户信息」或通讯录取得（ou_ 开头）。绑定后该飞书用户在工作台打开页面即可免登进入对应 AC 账号（需 gmlevel ≥ 1）。
      </p>
      <div className='grid gap-3 sm:grid-cols-3'>
        <div>
          <label className={labelClass} htmlFor='bind-open-id'>飞书 open_id</label>
          <input
            id='bind-open-id'
            value={openId}
            onChange={(e) => setOpenId(e.target.value)}
            placeholder='ou_xxxxxxxxxxxxxxxx'
            className={`${inputClass} font-mono`}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor='bind-feishu-name'>飞书姓名（备注用）</label>
          <input
            id='bind-feishu-name'
            value={feishuName}
            onChange={(e) => setFeishuName(e.target.value)}
            placeholder='张三'
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor='bind-ac-username'>AC 账号</label>
          <input
            id='bind-ac-username'
            value={acUsername}
            onChange={(e) => setAcUsername(e.target.value)}
            placeholder='admin'
            className={inputClass}
            required
          />
        </div>
      </div>
      <button
        type='submit'
        disabled={create.isPending}
        className='inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
      >
        <Plus className='h-4 w-4' />
        {create.isPending ? '保存中…' : '添加绑定'}
      </button>
    </form>
  );
}

function BindingRow({ binding }: { binding: FeishuBinding }) {
  const remove = useRemoveFeishuBinding();

  const handleRemove = () => {
    if (!window.confirm(`确认解绑「${binding.feishuName || binding.feishuOpenId} ↔ ${binding.acUsername}」？解绑后立即失去免登入口。`)) {
      return;
    }
    remove.mutate(binding.id, {
      onSuccess: () => toast.success('已解绑'),
      onError: (err) => toast.error((err as Error).message || '解绑失败'),
    });
  };

  return (
    <tr className='border-b border-border hover:bg-accent/50'>
      <td className='px-4 py-3 font-medium'>{binding.feishuName || '-'}</td>
      <td className='px-4 py-3 font-mono text-xs max-w-[260px] truncate' title={binding.feishuOpenId}>
        {binding.feishuOpenId}
      </td>
      <td className='px-4 py-3'>{binding.acUsername}</td>
      <td className='px-4 py-3 text-muted-foreground'>{binding.createdBy}</td>
      <td className='px-4 py-3 text-muted-foreground'>
        {new Date(binding.createdAt).toLocaleString('zh-CN', { hour12: false })}
      </td>
      <td className='px-4 py-3 text-right'>
        <button
          type='button'
          onClick={handleRemove}
          disabled={remove.isPending}
          className='inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50'
        >
          <Trash2 className='h-3.5 w-3.5' />
          解绑
        </button>
      </td>
    </tr>
  );
}

export function FeishuBindingManager() {
  const { data: bindings, isLoading } = useFeishuBindings();
  const items = bindings ?? [];

  return (
    <div className='space-y-4'>
      <CreateBindingForm />

      <div className='rounded-lg border border-border overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-border bg-card'>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>飞书姓名</th>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>open_id</th>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>AC 账号</th>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>创建人</th>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>创建时间</th>
              <th className='px-4 py-3' />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }, (_, r) => (
                <tr key={r} className='border-b border-border' aria-busy='true' aria-label='绑定列表加载中'>
                  {Array.from({ length: 6 }, (_, c) => (
                    <td key={c} className='px-4 py-3'>
                      <Skeleton className='h-4' style={{ width: `${[55, 80, 45, 40, 60, 30][c]}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className='px-4 py-8 text-center text-muted-foreground'>
                  暂无绑定，飞书用户将无法免登
                </td>
              </tr>
            ) : (
              items.map((binding) => <BindingRow key={binding.id} binding={binding} />)
            )}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <p className='text-sm text-muted-foreground'>共 {items.length} 条绑定</p>
      )}
    </div>
  );
}
