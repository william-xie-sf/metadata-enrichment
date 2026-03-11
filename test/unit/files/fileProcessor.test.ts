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
import type { MetadataType, SourceComponent } from '@salesforce/source-deploy-retrieve';
import type { EnrichmentRequestRecord, EnrichmentResult, FileReadResult } from '../../../src/index.js';
import { FileProcessor, EnrichmentStatus } from '../../../src/index.js';
import {
  API_METADATA_TYPE_LWC,
  SOURCE_COMPONENT_TYPE_NAME_LWC,
  SOURCE_COMPONENT_TYPE_NAME_SALESFORCE_OBJECT,
} from '../../../src/enrichment/constants/index.js';
import { DEFAULT_XML_METADATA_SCHEMA, SALESFORCE_OBJECT_XML_METADATA_SCHEMA } from '../../../src/schemas/index.js';

describe('FileProcessor', () => {
  describe('readComponentFile', () => {
    it('should read file and return FileReadResult', async () => {
      const result = await FileProcessor.readComponentFile('testComponent', 'package.json');

      expect(result).to.not.be.null;
      expect(result?.componentName).to.equal('testComponent');
      expect(result?.filePath).to.equal('package.json');
      expect(result?.fileContents).to.be.a('string');
      expect(result?.mimeType).to.be.a('string');
    });

    it('should return null when file does not exist', async () => {
      const result = await FileProcessor.readComponentFile('testComponent', 'nonexistent-file.txt');

      expect(result).to.be.null;
    });
  });

  describe('readComponentFiles', () => {
    it('should return empty array when component has no name', async () => {
      const component: Partial<SourceComponent> = {
        fullName: undefined,
        name: undefined,
      };

      const result = await FileProcessor.readComponentFiles(component as SourceComponent);

      expect(result).to.be.empty;
    });

    it('should read files from component walkContent', async () => {
      const mockFilePaths = ['file1.js', 'file2.html'];
      const component: Partial<SourceComponent> = {
        fullName: 'testComponent',
        name: 'testComponent',
        walkContent: () => mockFilePaths,
      };

      const originalRead = FileProcessor.readComponentFile.bind(FileProcessor);
      FileProcessor.readComponentFile = async (name: string, path: string): Promise<FileReadResult | null> => {
        if (path === 'file1.js' || path === 'file2.html') {
          return {
            componentName: name,
            filePath: path,
            fileContents: 'content',
            mimeType: 'text/plain',
          };
        }
        return null;
      };

      const result = await FileProcessor.readComponentFiles(component as SourceComponent);

      expect(result.length).to.be.greaterThan(0);
      FileProcessor.readComponentFile = originalRead;
    });

    it('should fall back to component.xml when walkContent returns empty (e.g. FlexiPage)', async () => {
      const component: Partial<SourceComponent> = {
        fullName: 'Contacts_Management',
        name: 'Contacts_Management',
        xml: 'package.json', // use a real file so readComponentFile succeeds
        walkContent: () => [],
      };

      const result = await FileProcessor.readComponentFiles(component as SourceComponent);

      expect(result.length).to.equal(1);
      expect(result[0].filePath).to.equal('package.json');
    });

    it('should return empty array when walkContent is empty and component.xml is undefined', async () => {
      const component: Partial<SourceComponent> = {
        fullName: 'NoFiles',
        name: 'NoFiles',
        xml: undefined,
        walkContent: () => [],
      };

      const result = await FileProcessor.readComponentFiles(component as SourceComponent);

      expect(result).to.be.empty;
    });
  });

  describe('updateMetaXml', () => {
    it('should update XML with enrichment result', () => {
      const xmlContent =
        '<?xml version="1.0"?><LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata"></LightningComponentBundle>';
      const result: EnrichmentResult = {
        resourceId: 'test',
        resourceName: 'test',
        metadataType: 'LightningComponentBundle',
        modelUsed: 'test',
        description: 'Test description',
        descriptionScore: 0.95,
      };

      const updated = FileProcessor.updateMetaXml(xmlContent, result, SOURCE_COMPONENT_TYPE_NAME_LWC);

      expect(updated).to.include('<description>Test description</description>');
      expect(updated).to.include('0.95');
      expect(updated).to.include('skipUplift');
    });

    it('should work with any XML root element', () => {
      const xmlContent = '<?xml version="1.0"?><SalesforceObject xmlns="http://soap.sforce.com/2006/04/metadata"></SalesforceObject>';
      const result: EnrichmentResult = {
        resourceId: 'test',
        resourceName: 'test',
        metadataType: 'SalesforceObject',
        modelUsed: 'test',
        description: 'Custom object description',
        descriptionScore: 0.8,
      };

      const updated = FileProcessor.updateMetaXml(xmlContent, result, SOURCE_COMPONENT_TYPE_NAME_SALESFORCE_OBJECT);

      expect(updated).to.include('<enrichedDescription>Custom object description</enrichedDescription>');
      expect(updated).to.include('<aiDescriptor>');
      expect(updated).to.include('0.8');
      expect(updated).to.include('SalesforceObject');
    });

    it('should decode and embed an encoded <description> tag from the result', () => {
      const xmlContent =
        '<?xml version="1.0"?><LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata"></LightningComponentBundle>';
      const result: EnrichmentResult = {
        resourceId: 'test',
        resourceName: 'test',
        metadataType: 'LightningComponentBundle',
        modelUsed: 'test',
        description: '&lt;description&gt;Encoded description text&lt;/description&gt;',
        descriptionScore: 0.9,
      };

      const updated = FileProcessor.updateMetaXml(xmlContent, result, SOURCE_COMPONENT_TYPE_NAME_LWC);

      expect(updated).to.include('<description>Encoded description text</description>');
      expect(updated).to.include('0.9');
      expect(updated).to.include('skipUplift');
    });

    it('should decode and embed encoded <description> and <property> tags as structured XML elements', () => {
      const xmlContent =
        '<?xml version="1.0"?><LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata"></LightningComponentBundle>';
      const result: EnrichmentResult = {
        resourceId: 'test',
        resourceName: 'test',
        metadataType: 'LightningComponentBundle',
        modelUsed: 'test',
        description:
          '&lt;description&gt;Component with properties&lt;/description&gt;&lt;property&gt;value1&lt;/property&gt;&lt;property&gt;value2&lt;/property&gt;',
        descriptionScore: 0.85,
      };

      const updated = FileProcessor.updateMetaXml(xmlContent, result, SOURCE_COMPONENT_TYPE_NAME_LWC);

      expect(updated).to.include('<description>Component with properties</description>');
      expect(updated).to.include('<property>value1</property>');
      expect(updated).to.include('<property>value2</property>');
      expect(updated).to.include('0.85');
    });

    it('should throw an error for invalid XML', () => {
      const invalidXml = '';
      const result: EnrichmentResult = {
        resourceId: 'test',
        resourceName: 'test',
        metadataType: 'LightningComponentBundle',
        modelUsed: 'test',
        description: 'Test',
        descriptionScore: 0.9,
      };

      expect(() => FileProcessor.updateMetaXml(invalidXml, result, SOURCE_COMPONENT_TYPE_NAME_LWC)).to.throw();
    });
  });

  describe('SALESFORCE_OBJECT_XML_METADATA_SCHEMA', () => {
    it('should write an <aiDescriptor> block with skipUplift, enrichedDescription, and score, and detect skipUplift', () => {
      const xmlRoot: Record<string, unknown> = {};
      const result: EnrichmentResult = {
        resourceId: 'test',
        resourceName: 'MyObject',
        metadataType: 'SalesforceObject',
        modelUsed: 'test',
        description: 'A test object',
        descriptionScore: 0.88,
      };

      SALESFORCE_OBJECT_XML_METADATA_SCHEMA.applyEnrichment(xmlRoot, result);

      const aiDescriptor = xmlRoot['aiDescriptor'] as Record<string, unknown>;
      expect(aiDescriptor).to.exist;
      expect(aiDescriptor['skipUplift']).to.equal('false');
      expect(aiDescriptor['enrichedDescription']).to.equal('A test object');
      expect(aiDescriptor['score']).to.equal('0.88');
      expect(SALESFORCE_OBJECT_XML_METADATA_SCHEMA.isSkipUpliftEnabled(xmlRoot)).to.be.false;

      aiDescriptor['skipUplift'] = 'true';
      expect(SALESFORCE_OBJECT_XML_METADATA_SCHEMA.isSkipUpliftEnabled(xmlRoot)).to.be.true;
    });
  });

  describe('DEFAULT_XML_METADATA_SCHEMA', () => {
    it('should write an <ai> block with skipUplift, description, and score, and detect skipUplift', () => {
      const xmlRoot: Record<string, unknown> = {};
      const result: EnrichmentResult = {
        resourceId: 'test',
        resourceName: 'MyComponent',
        metadataType: 'LightningComponentBundle',
        modelUsed: 'test',
        description: 'A test component',
        descriptionScore: 0.9,
      };

      DEFAULT_XML_METADATA_SCHEMA.applyEnrichment(xmlRoot, result);

      const ai = xmlRoot['ai'] as Record<string, unknown>;
      expect(ai).to.exist;
      expect(ai['skipUplift']).to.equal('false');
      expect(ai['description']).to.equal('A test component');
      expect(ai['score']).to.equal('0.9');
      expect(DEFAULT_XML_METADATA_SCHEMA.isSkipUpliftEnabled(xmlRoot)).to.be.false;

      ai['skipUplift'] = 'true';
      expect(DEFAULT_XML_METADATA_SCHEMA.isSkipUpliftEnabled(xmlRoot)).to.be.true;
    });
  });

  describe('updateMetadata', () => {
    it('should return enrichment records for unsupported component types', async () => {
      const mockType: MetadataType = { name: 'ApexClass' } as MetadataType;
      const components: SourceComponent[] = [{ type: mockType } as SourceComponent];
      const records = new Set<EnrichmentRequestRecord>();

      const result = await FileProcessor.updateMetadata(components, records);

      expect(result).to.equal(records);
    });

    it('should skip components with no enrichment response', async () => {
      const mockType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const record: EnrichmentRequestRecord = {
        componentName: 'test',
        componentType: mockType,
        requestBody: { contentBundles: [], metadataType: API_METADATA_TYPE_LWC },
        response: null,
        message: null,
        status: EnrichmentStatus.FAIL,
      };
      const components: SourceComponent[] = [
        { type: mockType, fullName: 'test', xml: 'test.js-meta.xml' } as unknown as SourceComponent,
      ];
      const records = new Set<EnrichmentRequestRecord>([record]);

      const result = await FileProcessor.updateMetadata(components, records);

      expect(result).to.equal(records);
      expect(record.message).to.be.null;
    });

    it('should skip when skipUplift is enabled', async () => {
      const xmlWithSkipUplift =
        '<?xml version="1.0"?><LightningComponentBundle><ai><skipUplift>true</skipUplift></ai></LightningComponentBundle>';

      const originalRead = FileProcessor.readComponentFile.bind(FileProcessor);
      FileProcessor.readComponentFile = async (): Promise<FileReadResult | null> => ({
        componentName: 'test',
        filePath: 'test.js-meta.xml',
        fileContents: xmlWithSkipUplift,
        mimeType: 'application/xml',
      });

      const mockType: MetadataType = { name: 'LightningComponentBundle' } as MetadataType;
      const mockResult: EnrichmentResult = { metadataType: 'LightningComponentBundle' } as EnrichmentResult;
      const record: EnrichmentRequestRecord = {
        componentName: 'test',
        componentType: mockType,
        requestBody: { contentBundles: [], metadataType: API_METADATA_TYPE_LWC },
        response: {
          metadata: { durationMs: 100, failureCount: 0, successCount: 1, timestamp: '' },
          results: [mockResult],
        },
        message: null,
        status: EnrichmentStatus.SUCCESS as EnrichmentStatus,
      };
      const components: SourceComponent[] = [
        { type: mockType, fullName: 'test', xml: 'test.js-meta.xml' } as unknown as SourceComponent,
      ];
      const records = new Set<EnrichmentRequestRecord>([record]);

      await FileProcessor.updateMetadata(components, records);

      const resultArray = Array.from(records);
      expect(resultArray[0].message).to.equal('skipUplift is set to true');
      expect(resultArray[0].status).to.equal(EnrichmentStatus.SKIPPED as EnrichmentStatus);

      FileProcessor.readComponentFile = originalRead;
    });
  });
});
