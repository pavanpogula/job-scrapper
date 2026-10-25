/**
 * @file Google Drive Unit Tests
 * @summary Unit test suite for Google Drive service account and user OAuth upload helpers
 * @tags Unit Test, Google Drive, Upload, OAuth, JWT
 */

import * as fs from 'fs';
import { uploadWithOAuth } from '../../src/lib/GoogleDriveOAuth';
import { uploadWithUserOAuth } from '../../src/lib/GoogleDriveUserOAuth';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

const mockFilesCreate = jest.fn();
const mockFilesList = jest.fn();

jest.mock('googleapis', () => {
  return {
    google: {
      auth: {
        JWT: jest.fn().mockImplementation(() => ({
          authorize: jest.fn().mockResolvedValue({})
        })),
        OAuth2: jest.fn().mockImplementation(() => ({
          setCredentials: jest.fn(),
          generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth'),
          getToken: jest.fn().mockResolvedValue({ tokens: { access_token: 'abc' } }),
          refreshAccessToken: jest.fn().mockResolvedValue({ credentials: { access_token: 'new-abc' } })
        }))
      },
      drive: jest.fn().mockImplementation(() => ({
        files: {
          create: mockFilesCreate,
          list: mockFilesList
        }
      }))
    }
  };
});

describe('GoogleDrive Upload Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GoogleDriveOAuth (Service Account JWT)', () => {
    it('should return null with helpful setup instructions if credentials file is missing', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = await uploadWithOAuth('/path/to/file.csv');

      expect(result).toBeNull();
      expect(mockFilesCreate).not.toHaveBeenCalled();
    });

    it('should upload CSV and return webViewLink when credentials are present', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          client_email: 'sa@project.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg...'
        })
      );
      mockedFs.createReadStream.mockReturnValue({} as any);

      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: 'file-id-123',
          webViewLink: 'https://drive.google.com/file/d/file-id-123/view'
        }
      });

      const result = await uploadWithOAuth('/path/to/jobs.csv', 'target-folder-id');

      expect(result).toBe('https://drive.google.com/file/d/file-id-123/view');
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: {
            name: 'jobs.csv',
            parents: ['target-folder-id']
          },
          supportsAllDrives: true
        })
      );
    });

    it('should handle storage quota error and return null', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          client_email: 'sa@project.iam.gserviceaccount.com',
          private_key: 'fake-key'
        })
      );
      mockedFs.createReadStream.mockReturnValue({} as any);

      mockFilesCreate.mockRejectedValueOnce(
        new Error('The user\'s drive storage quota has been exceeded')
      );

      const result = await uploadWithOAuth('/path/to/jobs.csv');
      expect(result).toBeNull();
    });
  });

  describe('GoogleDriveUserOAuth (User OAuth Consent Flow)', () => {
    it('should return null if oauth-credentials.json is missing', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = await uploadWithUserOAuth('/path/to/file.csv');

      expect(result).toBeNull();
      expect(mockFilesCreate).not.toHaveBeenCalled();
    });

    it('should upload file and return link when credentials and token exist', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.toString().includes('oauth-credentials.json')) {
          return JSON.stringify({
            installed: {
              client_id: 'test-client-id',
              client_secret: 'test-secret',
              redirect_uris: ['http://localhost']
            }
          });
        }
        if (filePath.toString().includes('oauth-token.json')) {
          return JSON.stringify({
            access_token: 'mock-access-token',
            expiry_date: Date.now() + 100000
          });
        }
        return '';
      });
      mockedFs.createReadStream.mockReturnValue({} as any);

      mockFilesCreate.mockResolvedValueOnce({
        data: {
          id: 'user-file-id-456',
          webViewLink: 'https://drive.google.com/file/d/user-file-id-456/view'
        }
      });

      const result = await uploadWithUserOAuth('/path/to/jobs.csv', 'user-folder-id');

      expect(result).toBe('https://drive.google.com/file/d/user-file-id-456/view');
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: {
            name: 'jobs.csv',
            parents: ['user-folder-id']
          }
        })
      );
    });
  });
});
