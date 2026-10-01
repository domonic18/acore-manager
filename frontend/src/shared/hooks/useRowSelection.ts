import { useCallback, useState } from 'react';

export interface RowSelectionController {
  selected: Set<string | number>;
  selectedCount: number;
  allSelected: boolean;
  isSelected: (key: string | number) => boolean;
  toggleOne: (key: string | number) => void;
  toggleAll: () => void;
  selectOnly: (key: string | number) => void;
  clear: () => void;
}

export function useRowSelection<T>(
  rows: T[],
  getKey: (row: T) => string | number,
): RowSelectionController {
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const toggleOne = useCallback((key: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === rows.length && rows.length > 0 ? new Set() : new Set(rows.map(getKey)),
    );
  }, [rows, getKey]);

  const selectOnly = useCallback((key: string | number) => {
    setSelected(new Set([key]));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    selectedCount: selected.size,
    allSelected: rows.length > 0 && selected.size === rows.length,
    isSelected: (key) => selected.has(key),
    toggleOne,
    toggleAll,
    selectOnly,
    clear,
  };
}
