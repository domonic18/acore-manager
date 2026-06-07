import { gmToolService } from '../../../src/services/gm-tool.service';
import { soapService } from '../../../src/services/soap.service';

jest.mock('../../../src/services/soap.service');

describe('GmToolService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('broadcast', () => {
    it('sends announce SOAP command', async () => {
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await gmToolService.broadcast('Server maintenance in 10 minutes');

      expect(soapService.sendCommand).toHaveBeenCalledWith('.announce Server maintenance in 10 minutes');
    });

    it('propagates SOAP errors', async () => {
      (soapService.sendCommand as jest.Mock).mockRejectedValue(new Error('SOAP timeout'));

      await expect(gmToolService.broadcast('test')).rejects.toThrow('SOAP timeout');
    });
  });
});
