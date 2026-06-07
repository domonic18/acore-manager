import { soapService } from './soap.service';

export class GmToolService {
  async broadcast(message: string): Promise<void> {
    await soapService.sendCommand(`.announce ${message}`);
  }
}

export const gmToolService = new GmToolService();
