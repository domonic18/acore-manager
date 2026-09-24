import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ai_anticheat_exemption' })
export class AiAnticheatExemption {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', name: 'character_guid' })
  characterGuid!: number;

  @Column({ type: 'varchar', length: 50, name: 'violation_type' })
  violationType!: string;

  @Column({ type: 'int', nullable: true, name: 'map_id' })
  mapId!: number | null;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ type: 'varchar', length: 100, name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
