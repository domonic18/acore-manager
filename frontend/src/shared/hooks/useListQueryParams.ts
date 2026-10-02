import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ListParamPatch = Record<string, string | number | null | undefined>;

// 列表页筛选/翻页状态持久化到 URL：进出详情返回后状态恢复，深链可直达。
// set 中 null/undefined/'' 表示删除该键；replace 默认 true（筛选/翻页不产生历史记录），
// 搜索提交等需要回退锚点的场景显式传 replace:false。
export function useListQueryParams() {
  const [params, setParams] = useSearchParams();

  const set = useCallback(
    (patch: ListParamPatch, opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: opts?.replace ?? true },
      );
    },
    [setParams],
  );

  return { params, set };
}
