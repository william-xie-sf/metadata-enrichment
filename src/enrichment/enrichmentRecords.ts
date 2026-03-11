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
import type { SourceComponent } from '@salesforce/source-deploy-retrieve';

import type { MetadataTypeAndName } from '../common/types.js';
import type { EnrichmentRequestRecord } from './constants/api.js';
import { EnrichmentStatus } from './constants/api.js';

const DEFAULT_REQUEST_BODY: EnrichmentRequestRecord['requestBody'] = {
    contentBundles: [],
    metadataType: 'Generic'
}

/**
 * An all-in-one data object used for tracking the enrichment process storing the components, 
 * their enrichment request and responses, and their enrichment results.
 */
export class EnrichmentRecords {
  public readonly recordSet: Set<EnrichmentRequestRecord>;

  public constructor(projectSourceComponents: SourceComponent[]) {
    this.recordSet = new Set<EnrichmentRequestRecord>();

    // Create initial records for all provided source components with default request body
    for (const component of projectSourceComponents) {
      const componentName = component.fullName ?? component.name;
      if (componentName && component.type) {
        this.recordSet.add({
          componentName,
          componentType: component.type,
          requestBody: DEFAULT_REQUEST_BODY,
          response: null,
          message: null,
          status: EnrichmentStatus.NOT_PROCESSED,
        });
      }
    }
  }

  public addRecords(records: Set<EnrichmentRequestRecord>): void {
    for (const record of records) {
      // Skip if a record for this component already exists
      const existingRecord = Array.from(this.recordSet).find((r) => r.componentName === record.componentName);
      if (existingRecord) continue;

      this.recordSet.add(record);
    }
  }

  public updateWithStatus(componentsToUpdate: Set<MetadataTypeAndName>, status: EnrichmentStatus): void {
    const componentsToUpdateMap = new Map<string, MetadataTypeAndName>();
    for (const component of componentsToUpdate) {
      if (component.componentName) {
        componentsToUpdateMap.set(component.componentName, component);
      }
    }

    for (const record of this.recordSet) {
      const componentToUpdate = componentsToUpdateMap.get(record.componentName);
      if (componentToUpdate) {
        record.status = status;
      }
    }
  }

  public updateWithResults(results: EnrichmentRequestRecord[]): void {
    const resultsMap = new Map(results.map((r) => [r.componentName, r]));
    for (const record of this.recordSet) {
      const processedResult = resultsMap.get(record.componentName);
      if (processedResult) {
        record.requestBody = processedResult.requestBody;
        record.response = processedResult.response;
        if (record.status !== EnrichmentStatus.SKIPPED) {
          record.status = processedResult.response ? EnrichmentStatus.SUCCESS : EnrichmentStatus.FAIL;
        }
        record.message = processedResult.message;
      }
    }
  }


}
