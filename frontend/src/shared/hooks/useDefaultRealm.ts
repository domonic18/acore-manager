import { useQuery } from '@tanstack/react-query';
import { systemConfigReadApi } from '@/shared/api/system-config.api';

const KEY = ['system-config'];

// 供诊断页等跨 feature 消费默认 realm：加载前返回 ''（调用方以 falsy 判断未就绪）
export function useDefaultRealm(): string {
  const { data } = useQuery({ queryKey: KEY, queryFn: systemConfigReadApi.get });
  return data?.defaultRealm ?? '';
}
