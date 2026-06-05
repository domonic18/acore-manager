import { DataSource, Repository } from 'typeorm';

export class BaseRepository<T extends object> {
  protected repo: Repository<T>;

  constructor(dataSource: DataSource, entity: new () => T) {
    this.repo = dataSource.getRepository(entity);
  }
}
