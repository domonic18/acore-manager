import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 飞书免登绑定（acm.acm_feishu_bindings）：飞书 open_id ↔ AC 账号 1:1 映射，登录时实时校验 gmlevel */
@Entity({ name: 'acm_feishu_bindings' })
export class AcmFeishuBinding {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64, name: 'feishu_open_id' })
  feishuOpenId!: string;

  @Column({ type: 'varchar', length: 64, name: 'feishu_union_id', default: '' })
  feishuUnionId!: string;

  @Column({ type: 'varchar', length: 256, name: 'feishu_name', default: '' })
  feishuName!: string;

  @Column({ type: 'varchar', length: 64, name: 'ac_username' })
  acUsername!: string;

  @Column({ type: 'varchar', length: 100, name: 'created_by', default: 'system' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
