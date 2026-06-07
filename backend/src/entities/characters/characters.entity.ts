import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'characters', database: 'acore_characters' })
export class Character {
  @PrimaryGeneratedColumn()
  guid!: number;

  @Column({ name: 'account' })
  accountId!: number;

  @Column()
  name!: string;

  @Column()
  race!: number;

  @Column()
  class!: number;

  @Column({ name: 'gender' })
  gender!: number;

  @Column()
  level!: number;

  @Column({ name: 'xp' })
  xp!: number;

  @Column({ name: 'money' })
  money!: number;

  @Column({ name: 'skin' })
  skin!: number;

  @Column({ name: 'face' })
  face!: number;

  @Column({ name: 'hairStyle' })
  hairStyle!: number;

  @Column({ name: 'hairColor' })
  hairColor!: number;

  @Column({ name: 'facialStyle' })
  facialStyle!: number;

  @Column({ name: 'bankSlots' })
  bankSlots!: number;

  @Column({ name: 'restState' })
  restState!: number;

  @Column({ name: 'playerFlags' })
  playerFlags!: number;

  @Column({ name: 'position_x' })
  positionX!: number;

  @Column({ name: 'position_y' })
  positionY!: number;

  @Column({ name: 'position_z' })
  positionZ!: number;

  @Column()
  map!: number;

  @Column({ name: 'instance_id' })
  instanceId!: number;

  @Column({ name: 'instance_mode_mask' })
  instanceModeMask!: number;

  @Column({ name: 'orientation' })
  orientation!: number;

  @Column({ name: 'taximask' })
  taxiMask!: string;

  @Column({ name: 'online' })
  online!: number;

  @Column({ name: 'cinematic' })
  cinematic!: number;

  @Column({ name: 'totaltime' })
  totalTime!: number;

  @Column({ name: 'leveltime' })
  levelTime!: number;

  @Column({ name: 'logout_time' })
  logoutTime!: number;

  @Column({ name: 'is_logout_resting' })
  isLogoutResting!: number;

  @Column({ name: 'rest_bonus' })
  restBonus!: number;

  @Column({ name: 'resettalents_cost' })
  resetTalentsCost!: number;

  @Column({ name: 'resettalents_time' })
  resetTalentsTime!: number;

  @Column({ name: 'trans_x' })
  transX!: number;

  @Column({ name: 'trans_y' })
  transY!: number;

  @Column({ name: 'trans_z' })
  transZ!: number;

  @Column({ name: 'trans_o' })
  transO!: number;

  @Column({ name: 'transguid' })
  transGuid!: number;

  @Column({ name: 'extra_flags' })
  extraFlags!: number;

  @Column({ name: 'stable_slots' })
  stableSlots!: number;

  @Column({ name: 'at_login' })
  atLogin!: number;

  @Column({ name: 'zone' })
  zone!: number;

  @Column({ name: 'death_expire_time' })
  deathExpireTime!: number;

  @Column({ name: 'taxi_path', nullable: true })
  taxiPath?: string;

  @Column({ name: 'arenaPoints' })
  arenaPoints!: number;

  @Column({ name: 'totalHonorPoints' })
  totalHonorPoints!: number;

  @Column({ name: 'todayHonorPoints' })
  todayHonorPoints!: number;

  @Column({ name: 'yesterdayHonorPoints' })
  yesterdayHonorPoints!: number;

  @Column({ name: 'totalKills' })
  totalKills!: number;

  @Column({ name: 'todayKills' })
  todayKills!: number;

  @Column({ name: 'yesterdayKills' })
  yesterdayKills!: number;

  @Column({ name: 'chosenTitle' })
  chosenTitle!: number;

  @Column({ name: 'knownCurrencies' })
  knownCurrencies!: number;

  @Column({ name: 'watchedFaction' })
  watchedFaction!: number;

  @Column({ name: 'drunk' })
  drunk!: number;

  @Column({ name: 'health' })
  health!: number;

  @Column({ name: 'power1' })
  power1!: number;

  @Column({ name: 'power2' })
  power2!: number;

  @Column({ name: 'power3' })
  power3!: number;

  @Column({ name: 'power4' })
  power4!: number;

  @Column({ name: 'power5' })
  power5!: number;

  @Column({ name: 'power6' })
  power6!: number;

  @Column({ name: 'power7' })
  power7!: number;

  @Column({ name: 'latency' })
  latency!: number;

  @Column({ name: 'talentGroupsCount' })
  talentGroupsCount!: number;

  @Column({ name: 'activeTalentGroup' })
  activeTalentGroup!: number;

  @Column({ name: 'exploredZones' })
  exploredZones!: string;

  @Column({ name: 'equipmentCache' })
  equipmentCache!: string;

  @Column({ name: 'ammoId' })
  ammoId!: number;

  @Column({ name: 'knownTitles' })
  knownTitles!: string;

  @Column({ name: 'actionBars' })
  actionBars!: number;

  @Column({ name: 'grantableLevels' })
  grantableLevels!: number;

  @Column({ name: 'deleteInfos_Account', nullable: true })
  deleteInfosAccount?: number;

  @Column({ name: 'deleteInfos_Name', nullable: true })
  deleteInfosName?: string;

  @Column({ name: 'deleteDate', nullable: true })
  deleteDate?: Date;

  @Column({ name: 'creation_date' })
  creationDate!: Date;

  @Column({ name: 'createCharacterDraft', default: 0 })
  createCharacterDraft!: number;
}
