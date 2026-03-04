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
import type { MetadataType } from '@salesforce/source-deploy-retrieve';
import type { ComponentEnrichmentStatus } from '../../../src/index.js';
import type { EnrichmentRequestRecord, EnrichmentRequestBody, EnrichmentResult } from '../../../src/index.js';
import { EnrichmentMetrics, EnrichmentStatus } from '../../../src/index.js';
import { METADATA_TYPE_GENERIC, METADATA_TYPE_LWC } from '../../../src/enrichment/constants/index.js';

describe('EnrichmentMetrics', () => {
  describe('initialization', () => {
    it('should initialize all metrics to zero', () => {
      const metrics: EnrichmentMetrics = new EnrichmentMetrics();
      expect(metrics.success.count).to.equal(0);
      expect(metrics.success.components).to.be.empty;
      expect(metrics.fail.count).to.equal(0);
      expect(metrics.fail.components).to.be.empty;
      expect(metrics.skipped.count).to.equal(0);
      expect(metrics.skipped.components).to.be.empty;
      expect(metrics.total).to.equal(0);
    });
  });

  describe('successful components', () => {
    it('should add component to success list and increment counts', () => {
      const metrics: EnrichmentMetrics = new EnrichmentMetrics();
      const component: ComponentEnrichmentStatus = {
        typeName: 'LightningComponentBundle',
        componentName: 'testComponent',
        message: 'Success',
        requestId: 'req-123',
      };

      metrics.addSuccessComponent(component);

      expect(metrics.success.count).to.equal(1);
      expect(metrics.success.components).to.include(component);
      expect(metrics.success.components[0].requestId).to.equal('req-123');
      expect(metrics.total).to.equal(1);
    });
  });

  describe('failed components', () => {
    it('should add component to fail list and increment counts', () => {
      const metrics: EnrichmentMetrics = new EnrichmentMetrics();
      const component: ComponentEnrichmentStatus = {
        typeName: 'LightningComponentBundle',
        componentName: 'testComponent',
        message: 'Failed',
        requestId: 'req-123',
      };

      metrics.addFailComponent(component);

      expect(metrics.fail.count).to.equal(1);
      expect(metrics.fail.components).to.include(component);
      expect(metrics.fail.components[0].requestId).to.equal('req-123');
      expect(metrics.total).to.equal(1);
    });
  });

  describe('skipped components', () => {
    it('should add component to skipped list and increment counts', () => {
      const metrics: EnrichmentMetrics = new EnrichmentMetrics();
      const component: ComponentEnrichmentStatus = {
        typeName: 'LightningComponentBundle',
        componentName: 'testComponent',
        message: 'Skipped',
        requestId: 'req-123',
      };

      metrics.addSkippedComponent(component);

      expect(metrics.skipped.count).to.equal(1);
      expect(metrics.skipped.components).to.include(component);
      expect(metrics.skipped.components[0].requestId).to.equal('req-123');
      expect(metrics.total).to.equal(1);
    });
  });

  describe('creating from records', () => {
    it('should categorize records with response as success', () => {
      const mockComponentType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const mockRequestBody: EnrichmentRequestBody = {
        contentBundles: [],
        metadataType: METADATA_TYPE_LWC,
        maxTokens: 50,
      };
      const mockResult: EnrichmentResult = { metadataType: 'LightningComponentBundle' } as EnrichmentResult;
      const records: EnrichmentRequestRecord[] = [
        {
          componentName: 'component1',
          componentType: mockComponentType,
          requestBody: mockRequestBody,
          response: {
            metadata: { durationMs: 100, failureCount: 0, successCount: 1, timestamp: '' },
            results: [mockResult],
          },
          message: null,
          status: EnrichmentStatus.SUCCESS as EnrichmentStatus,
        },
      ];

      const metrics: EnrichmentMetrics = EnrichmentMetrics.createEnrichmentMetrics(records);

      expect(metrics.success.count).to.equal(1);
      expect(metrics.fail.count).to.equal(0);
      expect(metrics.total).to.equal(1);
      expect(metrics.success.components[0].componentName).to.equal('component1');
    });

    it('should categorize records without response as fail', () => {
      const mockComponentType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const mockRequestBody: EnrichmentRequestBody = {
        contentBundles: [],
        metadataType: METADATA_TYPE_LWC,
        maxTokens: 50,
      };
      const records: EnrichmentRequestRecord[] = [
        {
          componentName: 'component1',
          componentType: mockComponentType,
          requestBody: mockRequestBody,
          response: null,
          message: 'Error occurred',
          status: EnrichmentStatus.FAIL as EnrichmentStatus,
        },
      ];

      const metrics: EnrichmentMetrics = EnrichmentMetrics.createEnrichmentMetrics(records);

      expect(metrics.success.count).to.equal(0);
      expect(metrics.fail.count).to.equal(1);
      expect(metrics.total).to.equal(1);
      expect(metrics.fail.components[0].message).to.equal('Error occurred');
    });

    it('should handle skipped components', () => {
      const mockComponentType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const mockRequestBody: EnrichmentRequestBody = {
        contentBundles: [],
        metadataType: METADATA_TYPE_LWC,
        maxTokens: 50,
      };
      const records: EnrichmentRequestRecord[] = [
        {
          componentName: 'skipped1',
          componentType: mockComponentType,
          requestBody: mockRequestBody,
          response: null,
          message: 'Skipped',
          status: EnrichmentStatus.SKIPPED as EnrichmentStatus,
        },
      ];

      const metrics: EnrichmentMetrics = EnrichmentMetrics.createEnrichmentMetrics(records);

      expect(metrics.skipped.count).to.equal(1);
      expect(metrics.skipped.components[0].componentName).to.equal('skipped1');
      expect(metrics.skipped.components[0].message).to.equal('Skipped');
      expect(metrics.total).to.equal(1);
    });

    it('should use metadataType from response when componentType is not available', () => {
      const mockRequestBody: EnrichmentRequestBody = {
        contentBundles: [],
        metadataType: METADATA_TYPE_GENERIC,
        maxTokens: 50,
      };
      const mockResult: EnrichmentResult = { metadataType: 'ApexClass' } as EnrichmentResult;
      const records: EnrichmentRequestRecord[] = [
        {
          componentName: 'component1',
          componentType: null as unknown as MetadataType,
          requestBody: mockRequestBody,
          response: {
            metadata: { durationMs: 100, failureCount: 0, successCount: 1, timestamp: '' },
            results: [mockResult],
          },
          message: null,
          status: EnrichmentStatus.SUCCESS as EnrichmentStatus,
        },
      ];

      const metrics: EnrichmentMetrics = EnrichmentMetrics.createEnrichmentMetrics(records);

      expect(metrics.success.components[0].typeName).to.equal('ApexClass');
    });

    it('should categorize records with SKIPPED status as skipped', () => {
      const mockComponentType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const mockRequestBody: EnrichmentRequestBody = {
        contentBundles: [],
        metadataType: METADATA_TYPE_LWC,
        maxTokens: 50,
      };
      const mockResult: EnrichmentResult = { metadataType: 'LightningComponentBundle' } as EnrichmentResult;
      const records: EnrichmentRequestRecord[] = [
        {
          componentName: 'orderBuilder',
          componentType: mockComponentType,
          requestBody: mockRequestBody,
          response: {
            metadata: { durationMs: 100, failureCount: 0, successCount: 1, timestamp: '' },
            results: [mockResult],
          },
          message: 'skipUplift is set to true',
          status: EnrichmentStatus.SKIPPED as EnrichmentStatus,
        },
      ];

      const metrics: EnrichmentMetrics = EnrichmentMetrics.createEnrichmentMetrics(records);

      expect(metrics.success.count).to.equal(0);
      expect(metrics.fail.count).to.equal(0);
      expect(metrics.skipped.count).to.equal(1);
      expect(metrics.total).to.equal(1);
      expect(metrics.skipped.components[0].componentName).to.equal('orderBuilder');
      expect(metrics.skipped.components[0].message).to.equal('skipUplift is set to true');
    });
  });
});
