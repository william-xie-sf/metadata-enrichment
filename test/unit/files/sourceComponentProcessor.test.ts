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
import { EnrichmentStatus } from '../../../src/enrichment/constants/api.js';
import { SourceComponentProcessor } from '../../../src/files/sourceComponentProcessor.js';

function createSourceComponent(name: string, typeName: string, options?: { xml?: string }): SourceComponent {
  return {
    fullName: name,
    name,
    type: { name: typeName },
    xml: options?.xml,
  } as SourceComponent;
}

describe('SourceComponentProcessor', () => {
  describe('getComponentsToSkip', () => {
    it('should return empty set when sourceComponents and metadataEntries are empty', () => {
      const result = SourceComponentProcessor.getComponentsToSkip([], [], undefined);
      expect(result.size).to.equal(0);
    });

    it('should return empty set when requested LWC exists in source with xml', () => {
      const source = [createSourceComponent('MyCmp', 'LightningComponentBundle', { xml: 'mycmp.js-meta.xml' })];
      const result = SourceComponentProcessor.getComponentsToSkip(source, ['LightningComponentBundle:MyCmp'], undefined);
      expect(result.size).to.equal(0);
    });

    it('should include requested component when not in source (missing)', () => {
      const source = [createSourceComponent('OtherCmp', 'LightningComponentBundle', { xml: 'other.js-meta.xml' })];
      const result = SourceComponentProcessor.getComponentsToSkip(source, ['LightningComponentBundle:MissingCmp'], undefined);
      expect(result.size).to.be.greaterThan(0);
      const records = Array.from(result);
      const missing = records.find((r) => r.componentName === 'MissingCmp');
      expect(missing).to.not.be.undefined;
      expect(missing!.status).to.equal(EnrichmentStatus.SKIPPED);
      expect(missing!.message).to.equal('Component not found in project.');
    });

    it('should include non-LWC component in skip set with unsupported type message', () => {
      const source = [createSourceComponent('MyClass', 'ApexClass')];
      const result = SourceComponentProcessor.getComponentsToSkip(source, ['ApexClass:MyClass'], undefined);
      expect(result.size).to.be.greaterThan(0);
      const records = Array.from(result);
      const record = records.find((r) => r.componentName === 'MyClass');
      expect(record).to.not.be.undefined;
      expect(record!.componentType.name).to.equal('ApexClass');
      expect(record!.status).to.equal(EnrichmentStatus.SKIPPED);
      expect(record!.message).to.equal("Component type 'ApexClass' is not currently supported for enrichment.");
    });

    it('should include LWC without xml in skip set with configuration not found message', () => {
      const source = [createSourceComponent('NoMetaCmp', 'LightningComponentBundle')];
      const result = SourceComponentProcessor.getComponentsToSkip(source, ['LightningComponentBundle:NoMetaCmp'], undefined);
      expect(result.size).to.be.greaterThan(0);
      const record = Array.from(result).find((r) => r.componentName === 'NoMetaCmp');
      expect(record).to.not.be.undefined;
      expect(record!.status).to.equal(EnrichmentStatus.SKIPPED);
      expect(record!.message).to.equal("The component's metadata configuration file doesn't exist.");
    });

    it('should not include wildcard metadata entries in requested (no missing from wildcard)', () => {
      const source: SourceComponent[] = [];
      const result = SourceComponentProcessor.getComponentsToSkip(source, ['LightningComponentBundle:*'], undefined);
      expect(result.size).to.equal(0);
    });
  });
});
