/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect } from 'chai';
import type { Connection } from '@salesforce/core';
import type { MetadataType, SourceComponent } from '@salesforce/source-deploy-retrieve';
import type { EnrichMetadataResponse, EnrichmentResult } from '../../../src/enrichment/types/index.js';
import {
  EnrichmentHandler,
  getMimeTypeFromExtension,
  EnrichmentStatus,
} from '../../../src/enrichment/enrichmentHandler.js';
import {
  ENRICHMENT_REQUEST_ENTITY_ENCODING_HEADER,
  SUPPORTED_MIME_TYPES,
  API_METADATA_TYPE_LWC,
} from '../../../src/enrichment/constants/index.js';
import { FileProcessor } from '../../../src/files/index.js';
import type { FileReadResult } from '../../../src/files/index.js';

const mimeTypes: Record<string, string> = SUPPORTED_MIME_TYPES;

/** Stub readComponentFiles to return files per component (avoids walkContent). */
function stubReadComponentFiles(
  filesPerComponent: FileReadResult[] | ((component: SourceComponent) => FileReadResult[])
) {
  const original = FileProcessor.readComponentFiles.bind(FileProcessor);
  FileProcessor.readComponentFiles = async (component: SourceComponent): Promise<FileReadResult[]> => {
    if (typeof filesPerComponent === 'function') {
      return filesPerComponent(component);
    }
    return filesPerComponent.map((f) => ({
      ...f,
      componentName: component.fullName ?? component.name ?? f.componentName,
    }));
  };
  return () => {
    FileProcessor.readComponentFiles = original;
  };
}

describe('EnrichmentHandler', () => {
  describe('getMimeTypeFromExtension', () => {
    it('returns correct mime type for known extensions', () => {
      expect(getMimeTypeFromExtension('test.js')).to.equal(mimeTypes['.js']);
      expect(getMimeTypeFromExtension('test.html')).to.equal(mimeTypes['.html']);
      expect(getMimeTypeFromExtension('test.css')).to.equal(mimeTypes['.css']);
      expect(getMimeTypeFromExtension('test.xml')).to.equal(mimeTypes['.xml']);
      expect(getMimeTypeFromExtension('test.svg')).to.equal(mimeTypes['.svg']);
    });

    it('returns default mime type for unknown extensions', () => {
      expect(getMimeTypeFromExtension('test.unknown')).to.equal('application/octet-stream');
      expect(getMimeTypeFromExtension('test')).to.equal('application/octet-stream');
    });

    it('handles case-insensitive extensions', () => {
      expect(getMimeTypeFromExtension('test.JS')).to.equal(mimeTypes['.js']);
    });
  });

  describe('enrich', () => {
    it('returns empty when no components have names', async () => {
      const mockConnection = {
        requestPost: async (): Promise<EnrichMetadataResponse> => {
          throw new Error('Should not be called');
        },
      } as unknown as Connection;

      const components: SourceComponent[] = [{ fullName: undefined, name: undefined } as unknown as SourceComponent];

      const result = await EnrichmentHandler.enrich(mockConnection, components);

      expect(result).to.be.empty;
    });

    it('returns non-LWC components as SKIPPED records', async () => {
      const mockConnection = {
        requestPost: async (): Promise<EnrichMetadataResponse> => {
          throw new Error('Should not be called');
        },
      } as unknown as Connection;

      const apexType: MetadataType = { name: 'ApexClass' } as MetadataType;
      const auraType: MetadataType = { name: 'AuraDefinitionBundle' } as MetadataType;
      const components: SourceComponent[] = [
        { fullName: 'apexComponent', name: 'apexComponent', type: apexType } as unknown as SourceComponent,
        { fullName: 'auraComponent', name: 'auraComponent', type: auraType } as unknown as SourceComponent,
      ];

      const restore = stubReadComponentFiles([
        { componentName: 'apexComponent', filePath: 'x.js', fileContents: '', mimeType: 'application/javascript' },
        { componentName: 'auraComponent', filePath: 'x.js', fileContents: '', mimeType: 'application/javascript' },
      ]);

      const result = await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(result).to.have.length(2);
      expect(result.every((r) => r.status === EnrichmentStatus.SKIPPED)).to.be.true;
      expect(result.every((r) => r.response === null)).to.be.true;
      expect(result[0].componentName).to.equal('apexComponent');
      expect(result[1].componentName).to.equal('auraComponent');
      expect(result[0].message).to.include('not currently supported for enrichment');
    });

    it('returns LWC results first then non-LWC SKIPPED', async () => {
      const mockResponse: EnrichMetadataResponse = {
        metadata: {
          durationMs: 100,
          failureCount: 0,
          requestId: 'req-123',
          successCount: 1,
          timestamp: '2026-01-27T00:00:00Z',
        },
        results: [
          {
            resourceId: 'test-id',
            resourceName: 'lwcComponent',
            metadataType: 'LightningComponentBundle',
            modelUsed: 'test-model',
            description: 'Test description',
            descriptionScore: 0.95,
          },
        ],
      };

      const mockConnection = {
        requestPost: async (): Promise<EnrichMetadataResponse> => mockResponse,
      } as unknown as Connection;

      const lwcType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const apexType: MetadataType = { name: 'ApexClass' } as MetadataType;
      const lwcFiles: FileReadResult[] = [
        { componentName: 'lwcComponent', filePath: 'lwc.js', fileContents: 'test', mimeType: 'application/javascript' },
      ];

      const restore = stubReadComponentFiles((component: SourceComponent) => {
        const name = component.fullName ?? component.name;
        if (component.type?.name === 'LightningComponentBundle') {
          return lwcFiles;
        }
        return [{ componentName: name, filePath: 'x.js', fileContents: '', mimeType: 'application/javascript' }];
      });

      const components: SourceComponent[] = [
        { fullName: 'apexFirst', name: 'apexFirst', type: apexType } as unknown as SourceComponent,
        { fullName: 'lwcComponent', name: 'lwcComponent', type: lwcType } as unknown as SourceComponent,
        {
          fullName: 'auraLast',
          name: 'auraLast',
          type: { name: 'AuraDefinitionBundle' } as MetadataType,
        } as unknown as SourceComponent,
      ];

      const result = await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(result).to.have.length(3);
      expect(result[0].componentName).to.equal('lwcComponent');
      expect(result[0].status).to.equal(EnrichmentStatus.SUCCESS);
      expect(result[1].componentName).to.equal('apexFirst');
      expect(result[1].status).to.equal(EnrichmentStatus.SKIPPED);
      expect(result[2].componentName).to.equal('auraLast');
      expect(result[2].status).to.equal(EnrichmentStatus.SKIPPED);
    });

    it('returns one record for LWC with no files (SKIPPED from create, FAIL when sent)', async () => {
      const mockConnection = {
        requestPost: async (): Promise<EnrichMetadataResponse> => {
          throw new Error('Should not be called');
        },
      } as unknown as Connection;

      const restore = stubReadComponentFiles(() => []);

      const lwcType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const components: SourceComponent[] = [
        { fullName: 'testComponent', name: 'testComponent', type: lwcType } as unknown as SourceComponent,
      ];

      const result = await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(result).to.have.length(1);
      expect(result[0].componentName).to.equal('testComponent');
      expect(result[0].status).to.equal(EnrichmentStatus.FAIL);
      expect(result[0].message).to.include('Should not be called');
    });

    it('returns SUCCESS when LWC has files and API succeeds', async () => {
      const mockResult: EnrichmentResult = {
        resourceId: 'test-id',
        resourceName: 'testComponent',
        metadataType: 'LightningComponentBundle',
        modelUsed: 'test-model',
        description: 'Test description',
        descriptionScore: 0.95,
      };

      const mockConnection = {
        requestPost: async (): Promise<EnrichMetadataResponse> => ({
          metadata: { durationMs: 100, failureCount: 0, requestId: 'req-123', successCount: 1, timestamp: '2026-01-27T00:00:00Z' },
          results: [mockResult],
        }),
      } as unknown as Connection;

      const restore = stubReadComponentFiles([
        {
          componentName: 'testComponent',
          filePath: 'test.js',
          fileContents: 'test',
          mimeType: 'application/javascript',
        },
      ]);

      const lwcType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const components: SourceComponent[] = [
        { fullName: 'testComponent', name: 'testComponent', type: lwcType } as SourceComponent,
      ];

      const result = await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(result).to.have.length(1);
      expect(result[0].componentName).to.equal('testComponent');
      expect(result[0].status).to.equal(EnrichmentStatus.SUCCESS);
      expect(result[0].response?.results[0]).to.deep.equal(mockResult);
    });

    it('sends enrichment request with expected HTTP header X-Chatter-Entity-Encoding: false', async () => {
      let capturedOptions: { headers?: Record<string, string> } | undefined;
      const mockConnection = {
        requestPost: async (
          _url: string,
          _body: unknown,
          options?: { headers?: Record<string, string> }
        ): Promise<EnrichMetadataResponse> => {
          capturedOptions = options;
          return {
            metadata: { durationMs: 100, failureCount: 0, requestId: 'req-123', successCount: 1, timestamp: '2026-01-27T00:00:00Z' },
            results: [
              {
                resourceId: 'id',
                resourceName: 'testComponent',
                metadataType: 'LightningComponentBundle',
                modelUsed: 'test',
                description: 'D',
                descriptionScore: 0.9,
              },
            ],
          };
        },
      } as unknown as Connection;

      const restore = stubReadComponentFiles([
        {
          componentName: 'testComponent',
          filePath: 'test.js',
          fileContents: 'test',
          mimeType: 'application/javascript',
        },
      ]);

      const lwcType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const components: SourceComponent[] = [
        { fullName: 'testComponent', name: 'testComponent', type: lwcType } as unknown as SourceComponent,
      ];

      await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(capturedOptions).to.not.be.undefined;
      expect(capturedOptions?.headers).to.not.be.undefined;
      expect(capturedOptions?.headers?.[ENRICHMENT_REQUEST_ENTITY_ENCODING_HEADER]).to.equal('false');
    });

    it('sends enrichment request body with metadataType mapped from component type', async () => {
      let capturedBody: { metadataType?: string; contentBundles?: unknown[]; maxTokens?: number } | undefined;
      const mockConnection = {
        requestPost: async (
          _url: string,
          body: unknown
        ): Promise<EnrichMetadataResponse> => {
          capturedBody = body as typeof capturedBody;
          return {
            metadata: { durationMs: 100, failureCount: 0, requestId: 'req-123', successCount: 1, timestamp: '2026-01-27T00:00:00Z' },
            results: [
              {
                resourceId: 'id',
                resourceName: 'testComponent',
                metadataType: 'LightningComponentBundle',
                modelUsed: 'test',
                description: 'D',
                descriptionScore: 0.9,
              },
            ],
          };
        },
      } as unknown as Connection;

      const restore = stubReadComponentFiles([
        {
          componentName: 'testComponent',
          filePath: 'test.js',
          fileContents: 'test',
          mimeType: 'application/javascript',
        },
      ]);

      const lwcType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const components: SourceComponent[] = [
        { fullName: 'testComponent', name: 'testComponent', type: lwcType } as unknown as SourceComponent,
      ];

      await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(capturedBody).to.not.be.undefined;
      expect(capturedBody?.metadataType).to.equal(API_METADATA_TYPE_LWC);
      expect(capturedBody?.contentBundles).to.have.length(1);
    });

    it('returns FAIL when API throws', async () => {
      const mockConnection = {
        requestPost: async (): Promise<EnrichMetadataResponse> => {
          throw new Error('API request failed');
        },
      } as unknown as Connection;

      const restore = stubReadComponentFiles([
        {
          componentName: 'testComponent',
          filePath: 'test.js',
          fileContents: 'test',
          mimeType: 'application/javascript',
        },
      ]);

      const lwcType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const components: SourceComponent[] = [
        { fullName: 'testComponent', name: 'testComponent', type: lwcType } as unknown as SourceComponent,
      ];

      const result = await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(result).to.have.length(1);
      expect(result[0].status).to.equal(EnrichmentStatus.FAIL);
      expect(result[0].response).to.be.null;
      expect(result[0].message).to.include('API request failed');
    });

    it('returns SUCCESS and FAIL per request when multiple LWC', async () => {
      let callCount = 0;
      const mockConnection = {
        requestPost: async (): Promise<EnrichMetadataResponse> => {
          callCount++;
          if (callCount === 1) {
            return {
              metadata: { durationMs: 100, failureCount: 0, requestId: 'req-1', successCount: 1, timestamp: '2026-01-27T00:00:00Z' },
              results: [
                {
                  resourceId: 'id-1',
                  resourceName: 'comp1',
                  metadataType: 'LightningComponentBundle',
                  modelUsed: 'test',
                  description: 'D1',
                  descriptionScore: 0.9,
                },
              ],
            };
          }
          throw new Error('API request failed');
        },
      } as unknown as Connection;

      const restore = stubReadComponentFiles((component: SourceComponent) => {
        const name = component.fullName ?? component.name;
        return [{ componentName: name, filePath: 'x.js', fileContents: '', mimeType: 'application/javascript' }];
      });

      const lwcType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const components: SourceComponent[] = [
        { fullName: 'comp1', name: 'comp1', type: lwcType } as unknown as SourceComponent,
        { fullName: 'comp2', name: 'comp2', type: lwcType } as unknown as SourceComponent,
      ];

      const result = await EnrichmentHandler.enrich(mockConnection, components);
      restore();

      expect(result).to.have.length(2);
      expect(result[0].status).to.equal(EnrichmentStatus.SUCCESS);
      expect(result[0].response).to.not.be.null;
      expect(result[1].status).to.equal(EnrichmentStatus.FAIL);
      expect(result[1].response).to.be.null;
    });
  });
});
