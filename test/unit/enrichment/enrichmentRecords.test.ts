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
import type { SourceComponent } from '@salesforce/source-deploy-retrieve';
import type { EnrichmentRequestRecord } from '../../../src/enrichment/constants/api.js';
import { EnrichmentStatus } from '../../../src/enrichment/constants/api.js';
import { EnrichmentRecords } from '../../../src/enrichment/enrichmentRecords.js';

function createSourceComponent(name: string, typeName: string): SourceComponent {
  return {
    fullName: name,
    name,
    type: { name: typeName },
  } as SourceComponent;
}

describe('EnrichmentRecords', () => {

  describe('constructor', () => {
    it('should create NOT_PROCESSED records for each source component with type and name', () => {
      const source = [
        createSourceComponent('Cmp1', 'LightningComponentBundle'),
        createSourceComponent('Cmp2', 'LightningComponentBundle'),
      ];
      const records = new EnrichmentRecords(source);
      expect(records.recordSet.size).to.equal(2);
      const arr = Array.from(records.recordSet);
      expect(arr.every((r) => r.status === EnrichmentStatus.NOT_PROCESSED)).to.be.true;
      expect(arr.map((r) => r.componentName).sort()).to.deep.equal(['Cmp1', 'Cmp2']);
      expect(arr.every((r) => r.requestBody?.contentBundles?.length === 0)).to.be.true;
    });

    it('should set placeholder requestBody for each component (library sets real metadataType for processed components)', () => {
      const source = [createSourceComponent('MyLwc', 'LightningComponentBundle')];
      const records = new EnrichmentRecords(source);
      const record = Array.from(records.recordSet)[0];
      expect(record.requestBody).to.not.be.null;
      expect(record.requestBody!.contentBundles).to.deep.equal([]);
      expect(record.requestBody!.metadataType).to.equal('Generic');
    });

    it('should not create record when component has no name', () => {
      const source = [{ fullName: undefined, name: undefined, type: { name: 'LWC' } }] as unknown as SourceComponent[];
      const records = new EnrichmentRecords(source);
      expect(records.recordSet.size).to.equal(0);
    });

    it('should not create record when component has no type', () => {
      const source = [{ fullName: 'NoType', name: 'NoType', type: undefined }] as unknown as SourceComponent[];
      const records = new EnrichmentRecords(source);
      expect(records.recordSet.size).to.equal(0);
    });
  });

  describe('addRecords', () => {
    it('should add a record to the recordSet', () => {
      const enrichmentRecords = new EnrichmentRecords([]);
      const record: EnrichmentRequestRecord = {
        componentName: 'SkippedCmp',
        componentType: { name: 'LightningComponentBundle' } as SourceComponent['type'],
        requestBody: null,
        response: null,
        message: 'Component not found in project.',
        status: EnrichmentStatus.SKIPPED,
      };
      enrichmentRecords.addRecords(new Set([record]));
      expect(enrichmentRecords.recordSet.size).to.equal(1);
      const added = Array.from(enrichmentRecords.recordSet)[0];
      expect(added.componentName).to.equal('SkippedCmp');
      expect(added.status).to.equal(EnrichmentStatus.SKIPPED);
      expect(added.message).to.equal('Component not found in project.');
    });

    it('should not duplicate when record already exists', () => {
      const source = [createSourceComponent('Existing', 'LightningComponentBundle')];
      const enrichmentRecords = new EnrichmentRecords(source);
      const duplicate: EnrichmentRequestRecord = {
        componentName: 'Existing',
        componentType: { name: 'LightningComponentBundle' } as SourceComponent['type'],
        requestBody: null,
        response: null,
        message: 'some reason',
        status: EnrichmentStatus.SKIPPED,
      };
      enrichmentRecords.addRecords(new Set([duplicate]));
      expect(enrichmentRecords.recordSet.size).to.equal(1);
    });
  });

  describe('updateWithStatus', () => {
    it('should set status for matching records', () => {
      const source = [createSourceComponent('Cmp1', 'LightningComponentBundle')];
      const records = new EnrichmentRecords(source);
      records.updateWithStatus(
        new Set([{ typeName: 'LightningComponentBundle', componentName: 'Cmp1' }]),
        EnrichmentStatus.SKIPPED
      );
      const record = Array.from(records.recordSet)[0];
      expect(record.status).to.equal(EnrichmentStatus.SKIPPED);
    });
  });

  describe('updateWithResults', () => {
    it('should replace record requestBody with result requestBody (library-supplied metadataType)', () => {
      const source = [createSourceComponent('Cmp1', 'LightningComponentBundle')];
      const records = new EnrichmentRecords(source);
      const libraryRequestBody = {
        contentBundles: [{ resourceName: 'Cmp1', files: {} }],
        metadataType: 'Lwc' as const
      };
      records.updateWithResults([
        {
          componentName: 'Cmp1',
          componentType: { name: 'LightningComponentBundle' } as SourceComponent['type'],
          requestBody: libraryRequestBody,
          response: { metadata: { durationMs: 0, failureCount: 0, successCount: 1, timestamp: '' }, results: [] },
          message: null,
          status: EnrichmentStatus.SUCCESS,
        },
      ]);
      const record = Array.from(records.recordSet)[0];
      expect(record.requestBody).to.equal(libraryRequestBody);
      expect(record.requestBody).to.not.be.null;
      expect(record.requestBody!.metadataType).to.equal('Lwc');
    });

    it('should update record to SUCCESS when response is present', () => {
      const source = [createSourceComponent('Cmp1', 'LightningComponentBundle')];
      const records = new EnrichmentRecords(source);
      records.updateWithResults([
        {
          componentName: 'Cmp1',
          componentType: { name: 'LightningComponentBundle' } as SourceComponent['type'],
          requestBody: { contentBundles: [], metadataType: 'Generic' },
          response: {
            metadata: { durationMs: 0, failureCount: 0, successCount: 1, timestamp: '' },
            results: [],
          },
          message: null,
          status: EnrichmentStatus.SUCCESS,
        },
      ]);
      const record = Array.from(records.recordSet)[0];
      expect(record.status).to.equal(EnrichmentStatus.SUCCESS);
      expect(record.response).to.not.be.null;
    });

    it('should update record to FAIL when response is null', () => {
      const source = [createSourceComponent('Cmp1', 'LightningComponentBundle')];
      const records = new EnrichmentRecords(source);
      records.updateWithResults([
        {
          componentName: 'Cmp1',
          componentType: { name: 'LightningComponentBundle' } as SourceComponent['type'],
          requestBody: { contentBundles: [], metadataType: 'Generic' },
          response: null,
          message: 'error',
          status: EnrichmentStatus.FAIL,
        },
      ]);
      const record = Array.from(records.recordSet)[0];
      expect(record.status).to.equal(EnrichmentStatus.FAIL);
      expect(record.message).to.equal('error');
    });

    it('should not override status when record is SKIPPED', () => {
      const source = [createSourceComponent('Cmp1', 'LightningComponentBundle')];
      const records = new EnrichmentRecords(source);
      records.updateWithStatus(
        new Set([{ typeName: 'LightningComponentBundle', componentName: 'Cmp1' }]),
        EnrichmentStatus.SKIPPED
      );
      records.updateWithResults([
        {
          componentName: 'Cmp1',
          componentType: { name: 'LightningComponentBundle' } as SourceComponent['type'],
          requestBody: { contentBundles: [], metadataType: 'Generic' },
          response: {
            metadata: { durationMs: 0, failureCount: 0, successCount: 1, timestamp: '' },
            results: [],
          },
          message: null,
          status: EnrichmentStatus.SUCCESS,
        },
      ]);
      const record = Array.from(records.recordSet)[0];
      expect(record.status).to.equal(EnrichmentStatus.SKIPPED);
    });
  });

});
