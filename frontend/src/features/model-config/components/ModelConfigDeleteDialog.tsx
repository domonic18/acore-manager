import { ModelConfig } from '@/features/model-config/api/model-config.api';
import { useDeleteModelConfig } from '@/features/model-config/hooks/useModelConfig';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { toast } from '@/shared/utils/toast.util';

interface ModelConfigDeleteDialogProps {
  deleting: ModelConfig | null;
  onClose: () => void;
}

export function ModelConfigDeleteDialog({ deleting, onClose }: ModelConfigDeleteDialogProps) {
  const deleteMutation = useDeleteModelConfig();

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success(`已删除 ${deleting.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={deleting != null}
      onClose={onClose}
      title="确认删除"
      tone="danger"
      confirmText="确认删除"
      pendingText="删除中..."
      pending={deleteMutation.isPending}
      onConfirm={handleDelete}
    >
      <p className="text-sm text-muted-foreground">
        确认删除模型配置 <span className="font-medium text-foreground">{deleting?.name}</span>？
        {deleting?.isDefault && (
          <span className="block mt-1 text-red-600">
            该配置是当前默认模型，删除后自动提升首个启用配置为默认。
          </span>
        )}
      </p>
    </ConfirmDialog>
  );
}
