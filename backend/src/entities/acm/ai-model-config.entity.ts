import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'ai_model_config' })
export class AiModelConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: 'custom' })
  provider!: string;

  @Column({ type: 'varchar', length: 20, default: 'openai' })
  protocol!: string;

  @Column({ type: 'varchar', length: 500, name: 'base_url' })
  baseUrl!: string;

  @Column({ type: 'varchar', length: 100, name: 'model_name' })
  modelName!: string;

  @Column({ type: 'text', name: 'api_key_encrypted' })
  apiKeyEncrypted!: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  temperature!: number | null;

  @Column({ type: 'int', nullable: true, name: 'max_tokens' })
  maxTokens!: number | null;

  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'last_tested_at' })
  lastTestedAt!: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'last_test_status' })
  lastTestStatus!: string | null;

  @Column({ type: 'text', nullable: true, name: 'last_test_error' })
  lastTestError!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'created_by' })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
