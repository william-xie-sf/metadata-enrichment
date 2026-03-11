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

import type { ComponentEnrichmentStatus } from '../common/types.js';
import type { EnrichmentRequestRecord } from './constants/api.js';
import { EnrichmentStatus } from './constants/api.js';

/**
 * A metrics data object for storing the final enrichment results.
 * This includes components that were successfully enriched, failed, or skipped.
 * This metrics object can be used to generate the final console or json output.
 */
export class EnrichmentMetrics {
  public success: {
    count: number;
    components: ComponentEnrichmentStatus[];
  };
  public fail: {
    count: number;
    components: ComponentEnrichmentStatus[];
  };
  public skipped: {
    count: number;
    components: ComponentEnrichmentStatus[];
  };
  public total: number;

  public constructor() {
    this.success = {
      count: 0,
      components: [],
    };
    this.fail = {
      count: 0,
      components: [],
    };
    this.skipped = {
      count: 0,
      components: [],
    };
    this.total = 0;
  }

  public static createEnrichmentMetrics(
    enrichmentResults: EnrichmentRequestRecord[],
  ): EnrichmentMetrics {
    const metrics = new EnrichmentMetrics();

    for (const record of enrichmentResults) {
      const componentName = record.componentName;

      let typeName = '';
      if (record.componentType) {
        typeName = record.componentType.name;
      } else if (record.response?.results && record.response.results.length > 0) {
        typeName = record.response.results[0].metadataType;
      }

      // Skip records where we can't determine the metadata type
      if (!typeName) {
        continue;
      }

      const component: ComponentEnrichmentStatus = {
        typeName,
        componentName,
        message: record.message ?? (record.status === EnrichmentStatus.SUCCESS ? '' : 'Enrichment request failed'),
        requestId: record.response?.metadata?.requestId,
      };

      if (record.status === EnrichmentStatus.SUCCESS) {
        metrics.addSuccessComponent(component);
      } else if (record.status === EnrichmentStatus.SKIPPED) {
        metrics.addSkippedComponent(component);
      } else {
        metrics.addFailComponent(component);
      }
    }

    return metrics;
  }

  public addSuccessComponent(component: ComponentEnrichmentStatus): void {
    this.success.components.push(component);
    this.success.count++;
    this.total++;
  }

  public addFailComponent(component: ComponentEnrichmentStatus): void {
    this.fail.components.push(component);
    this.fail.count++;
    this.total++;
  }

  public addSkippedComponent(component: ComponentEnrichmentStatus): void {
    this.skipped.components.push(component);
    this.skipped.count++;
    this.total++;
  }
}
