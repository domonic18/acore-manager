import { soapService } from './soap.service';

export class GmToolService {
  async broadcast(message: string): Promise<void> {
    await soapService.sendCommand(`.announce ${message}`);
  }

  async sendItems(playerName: string, itemId: number, count: number = 1): Promise<void> {
    await soapService.sendCommand(`.send items ${playerName} "系统邮件" "管理后台发放" ${itemId}:${count}`);
  }

  async findPlayer(name: string): Promise<string> {
    return soapService.sendCommand(`.pinfo ${name}`);
  }
}

export const gmToolService = new GmToolService();
