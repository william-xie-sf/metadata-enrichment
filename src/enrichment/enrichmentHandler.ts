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

import { basename, extname } from 'node:path';
import type { Connection } from '@salesforce/core';
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core/messages';
import type { SourceComponent } from '@salesforce/source-deploy-retrieve';
import { FileProcessor } from '../files/fileProcessor.js';
import type { FileReadResult } from '../files/fileProcessor.js';
import {
  API_ENDPOINT_ENRICHMENT,
  ENRICHMENT_REQUEST_ENTITY_ENCODING_HEADER,
  SUPPORTED_MIME_TYPES,
  MAP_SOURCE_COMPONENT_TYPE_TO_METADATA_TYPE,
  API_METADATA_TYPE_GENERIC,
  SUPPORTED_COMPONENT_TYPES,
  EnrichmentStatus,
} from './constants/index.js';
import type { EnrichmentRequestRecord } from './constants/index.js';
import type {
  ContentBundleFile,
  ContentBundle,
  EnrichmentRequestBody,
  EnrichMetadataResponse,
} from './types/index.js';

Messages.importMessagesDirectory(import.meta.dirname);
const messages = Messages.loadMessages('@salesforce/metadata-enrichment', 'errors');

export { EnrichmentStatus };
export type { EnrichmentRequestRecord };

export function getMimeTypeFromExtension(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_MIME_TYPES[ext] || 'application/octet-stream';
}

export class EnrichmentHandler {
  /**
   * Processes and sends metadata enrichment requests for the input source components in the project.
   * Automatically determines the metadata type for enrichment requests based on the source component.
   * Supported component types are defined in SUPPORTED_COMPONENT_TYPES. All other component types are skipped.
   *
   * @param connection Salesforce connection instance
   * @param sourceComponents Array of source components to enrich
   * @returns Promise resolving to enrichment request records
   */
  public static async enrich(
    connection: Connection,
    sourceComponents: SourceComponent[],
  ): Promise<EnrichmentRequestRecord[]> {
    const supportedComponents: SourceComponent[] = [];
    const unsupportedComponents: SourceComponent[] = [];
    for (const component of sourceComponents) {
      if (SUPPORTED_COMPONENT_TYPES.has(component.type?.name ?? '')) {
        supportedComponents.push(component);
      } else {
        unsupportedComponents.push(component);
      }
    }

    const supportedRecords = await EnrichmentHandler.createEnrichmentRequestRecords(supportedComponents);
    const unsupportedRecords = await EnrichmentHandler.createEnrichmentRequestRecords(
      unsupportedComponents, EnrichmentStatus.SKIPPED, messages.getMessage('errors.unsupported.type.default'));

    const enrichmentResults = await EnrichmentHandler.sendEnrichmentRequests(connection, supportedRecords);

    return [...enrichmentResults, ...unsupportedRecords];
  }

  private static async createEnrichmentRequestRecord(
    component: SourceComponent,
    status?: EnrichmentStatus,
    message?: string | null
  ): Promise<EnrichmentRequestRecord> {
    const componentName = component.fullName ?? component.name;
    const files = await FileProcessor.readComponentFiles(component);
      if (files.length === 0) {
        return {
          componentName,
          componentType: component.type ?? null,
          requestBody: null,
          response: null,
          message: messages.getMessage('errors.file.read.failed', [componentName]),
          status: EnrichmentStatus.SKIPPED,
        };
      }

      const contentBundle = EnrichmentHandler.createContentBundle(componentName, files);
      const metadataType =
        MAP_SOURCE_COMPONENT_TYPE_TO_METADATA_TYPE[component.type?.name ?? ''] ?? API_METADATA_TYPE_GENERIC;
      const requestBody = EnrichmentHandler.createEnrichmentRequestBody(contentBundle, metadataType);

      return {
        componentName,
        componentType: component.type ?? null,
        requestBody,
        response: null,
        message: message ?? null,
        status: status ?? EnrichmentStatus.NOT_PROCESSED,
      };
  }

  private static async createEnrichmentRequestRecords(
    components: SourceComponent[],
    status?: EnrichmentStatus,
    message?: string | null,
  ): Promise<EnrichmentRequestRecord[]> {
    const recordPromises = components.map(async (component): Promise<EnrichmentRequestRecord | null> => {
      const componentName = component.fullName ?? component.name;
      if (!componentName) {
        return null;
      }

      return EnrichmentHandler.createEnrichmentRequestRecord(component, status, message);
    });

    const results = await Promise.all(recordPromises);
    return results.filter((r): r is EnrichmentRequestRecord => r !== null);
  }

  private static createContentBundleFile(file: FileReadResult): ContentBundleFile {
    return {
      filename: basename(file.filePath),
      mimeType: file.mimeType,
      content: file.fileContents,
      encoding: 'PlainText',
    };
  }

  private static createContentBundle(componentName: string, files: FileReadResult[]): ContentBundle {
    const contentBundleFiles: Record<string, ContentBundleFile> = {};

    for (const file of files) {
      const contentBundleFile = EnrichmentHandler.createContentBundleFile(file);
      contentBundleFiles[contentBundleFile.filename] = contentBundleFile;
    }

    return {
      resourceName: componentName,
      files: contentBundleFiles,
    };
  }

  private static createEnrichmentRequestBody(
    contentBundle: ContentBundle,
    metadataType: string = API_METADATA_TYPE_GENERIC,
  ): EnrichmentRequestBody {
    return {
      contentBundles: [contentBundle],
      metadataType
    };
  }

  private static async sendEnrichmentRequest(
    connection: Connection,
    record: EnrichmentRequestRecord,
  ): Promise<EnrichmentRequestRecord> {
    try {
      const response: EnrichMetadataResponse = await connection.requestPost(
        API_ENDPOINT_ENRICHMENT,
        record.requestBody ?? {},
        {
          headers: {
            [ENRICHMENT_REQUEST_ENTITY_ENCODING_HEADER]: 'false',
          },
        },
      );
      return {
        ...record,
        response,
        status: EnrichmentStatus.SUCCESS,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SfError(messages.getMessage('errors.enrichment.request', [record.componentName, errorMessage]));
    }
  }

  private static async sendEnrichmentRequests(
    connection: Connection,
    records: EnrichmentRequestRecord[],
  ): Promise<EnrichmentRequestRecord[]> {
    const requestPromises = records.map((record) => EnrichmentHandler.sendEnrichmentRequest(connection, record));

    const requestResults = await Promise.allSettled(requestPromises);

    return requestResults.map((result, index) => {
      // If the request was successful, return the record with the response populated
      if (result.status === 'fulfilled') {
        return result.value;
      }
      // If the request was not successful, capture the error message
      const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
      return {
        ...records[index],
        response: null,
        message: errorMessage,
        status: EnrichmentStatus.FAIL,
      };
    });
  }
}
