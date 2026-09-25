import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'acm_system_config' })
export class AcmSystemConfig {
  @PrimaryColumn({ type: 'varchar', length: 64, name: 'config_key' })
  configKey!: string;

  @Column({ type: 'text', name: 'config_value' })
  configValue!: string;

  @Column({ type: 'boolean', name: 'is_secret', default: false })
  isSecret!: boolean;

  @Column({ type: 'varchar', length: 64, name: 'updated_by', default: '' })
  updatedBy!: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
