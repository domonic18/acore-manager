import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 误报场景库条目（acm.ai_fp_scenario）：带 spots 的条目按坐标半径命中产出 quest 强信号，无 spots 按 地图×类型 命中产出 map 强信号 */
@Entity({ name: 'ai_fp_scenario' })
export class AiFpScenario {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true, name: 'map_id' })
  mapId!: number | null;

  @Column({ type: 'varchar', length: 50, name: 'violation_type' })
  violationType!: string;

  @Column({ type: 'int', nullable: true, name: 'quest_id' })
  questId!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  spots!: { x: number; y: number; z: number; radiusYards: number }[] | null;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ type: 'varchar', length: 100, name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
