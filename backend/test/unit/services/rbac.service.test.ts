import { rbacService } from '../../../src/services/rbac.service';
import { rbacRepository } from '../../../src/repositories/rbac.repository';
import { soapService } from '../../../src/services/soap.service';
import { auditLogService } from '../../../src/services/audit-log.service';
import { authDataSource } from '../../../src/config/database';

jest.mock('../../../src/repositories/rbac.repository');
jest.mock('../../../src/services/soap.service');
jest.mock('../../../src/services/audit-log.service');
jest.mock('../../../src/config/database', () => ({
  authDataSource: {
    createQueryRunner: jest.fn(),
  },
}));

describe('RbacService', () => {
  const mockQueryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (authDataSource.createQueryRunner as jest.Mock).mockReturnValue(mockQueryRunner);
    (soapService.sendCommand as jest.Mock).mockResolvedValue(undefined);
    (auditLogService.record as jest.Mock).mockResolvedValue(undefined);
  });

  describe('updateRolePermissions', () => {
    it('only modifies cross-faction permission IDs and preserves other permissions', async () => {
      // Role 195 currently has cross-faction friend (29), admin (100), gm (200)
      (rbacRepository.getLinkedPermissionIds as jest.Mock).mockResolvedValue([29, 100, 200]);
      (rbacRepository.linkPermission as jest.Mock).mockResolvedValue(undefined);
      (rbacRepository.unlinkPermission as jest.Mock).mockResolvedValue(undefined);

      // Request: enable trading (51), keep friend (29) not included => should remove 29
      // 100 and 200 are not cross-faction and must be preserved
      await rbacService.updateRolePermissions(195, [51], 1, 'admin');

      expect(rbacRepository.linkPermission).toHaveBeenCalledTimes(1);
      expect(rbacRepository.linkPermission).toHaveBeenCalledWith(195, 51, mockQueryRunner);

      expect(rbacRepository.unlinkPermission).toHaveBeenCalledTimes(1);
      expect(rbacRepository.unlinkPermission).toHaveBeenCalledWith(195, 29, mockQueryRunner);

      expect(rbacRepository.unlinkPermission).not.toHaveBeenCalledWith(195, 100, expect.anything());
      expect(rbacRepository.unlinkPermission).not.toHaveBeenCalledWith(195, 200, expect.anything());
    });

    it('ignores non-allowed permission IDs in the request', async () => {
      (rbacRepository.getLinkedPermissionIds as jest.Mock).mockResolvedValue([29]);
      (rbacRepository.linkPermission as jest.Mock).mockResolvedValue(undefined);
      (rbacRepository.unlinkPermission as jest.Mock).mockResolvedValue(undefined);

      await rbacService.updateRolePermissions(195, [51, 9999], 1, 'admin');

      expect(rbacRepository.linkPermission).toHaveBeenCalledTimes(1);
      expect(rbacRepository.linkPermission).toHaveBeenCalledWith(195, 51, mockQueryRunner);
      expect(rbacRepository.linkPermission).not.toHaveBeenCalledWith(195, 9999, expect.anything());
    });

    it('does not throw when SOAP reload fails', async () => {
      (rbacRepository.getLinkedPermissionIds as jest.Mock).mockResolvedValue([29]);
      (rbacRepository.linkPermission as jest.Mock).mockResolvedValue(undefined);
      (rbacRepository.unlinkPermission as jest.Mock).mockResolvedValue(undefined);
      (soapService.sendCommand as jest.Mock).mockRejectedValue(new Error('SOAP unreachable'));

      await expect(
        rbacService.updateRolePermissions(195, [51], 1, 'admin'),
      ).resolves.toBeUndefined();

      expect(rbacRepository.linkPermission).toHaveBeenCalledWith(195, 51, mockQueryRunner);
      expect(auditLogService.record).toHaveBeenCalled();
    });
  });
});
