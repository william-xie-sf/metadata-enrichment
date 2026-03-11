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

import { readFile, writeFile } from 'node:fs/promises';
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core/messages';
import type { SourceComponent } from '@salesforce/source-deploy-retrieve';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { EnrichmentRequestRecord } from '../enrichment/constants/api.js';
import { EnrichmentStatus, SUPPORTED_COMPONENT_TYPES, METADATA_TYPE_CONFIGS } from '../enrichment/constants/api.js';
import { DEFAULT_XML_METADATA_SCHEMA } from '../schemas/index.js';
import { getMimeTypeFromExtension } from '../enrichment/enrichmentHandler.js';
import type { EnrichmentResult } from '../enrichment/types/index.js';

Messages.importMessagesDirectory(import.meta.dirname);
const messages = Messages.loadMessages('@salesforce/metadata-enrichment', 'errors');

export type FileReadResult = {
  componentName: string;
  filePath: string;
  fileContents: string;
  mimeType: string;
};

/**
 * A main entryway for processing metadata file operations
 * with support for reading from and writing to component files.
 * All supported component types write enrichment results to their xml metadata file (component.xml).
 */
export class FileProcessor {

  public static async updateMetadata(
    componentsToProcess: SourceComponent[],
    enrichmentRecords: Set<EnrichmentRequestRecord>,
  ): Promise<Set<EnrichmentRequestRecord>> {
    for (const component of componentsToProcess) {

      // Skip if unsupported component type
      if (!SUPPORTED_COMPONENT_TYPES.has(component.type?.name ?? '')) {
        continue;
      }

      // Skip if source component is missing name or metadata file location
      const componentName = component.fullName ?? component.name;
      if (!componentName || !component.xml) {
        continue;
      }

      // Find the enrichment record matching the source component
      let enrichmentRecord: EnrichmentRequestRecord | undefined;
      for (const record of enrichmentRecords) {
        if (record.componentName === componentName) {
          enrichmentRecord = record;
          break;
        }
      }

      // Skip if for some reason the enrichment record is missing a response
      if (!enrichmentRecord?.response) {
        continue;
      }

      const enrichmentResult: EnrichmentResult | undefined = enrichmentRecord.response.results[0];
      if (!enrichmentResult) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const fileResult = await FileProcessor.readComponentFile(componentName, component.xml);
      if (!fileResult) {
        continue;
      }

      const componentTypeName = component.type?.name ?? '';

      // Skip processing if <skipUplift> tag is set to true
      if (FileProcessor.isSkipUpliftEnabled(fileResult.fileContents, componentTypeName)) {
        enrichmentRecord.message = 'skipUplift is set to true';
        enrichmentRecord.status = EnrichmentStatus.SKIPPED;
        continue;
      }

      // Write to component's metadata XML file
      try {
        const updatedXml = FileProcessor.updateMetaXml(fileResult.fileContents, enrichmentResult, componentTypeName);
        // eslint-disable-next-line no-await-in-loop
        await writeFile(component.xml, updatedXml, 'utf-8');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        enrichmentRecord.message = errorMessage;
      }
    }

    return enrichmentRecords;
  }

  public static async readComponentFile(componentName: string, filePath: string): Promise<FileReadResult | null> {
    try {
      const fileContents = await readFile(filePath, 'utf-8');
      const mimeType = getMimeTypeFromExtension(filePath);

      return {
        componentName,
        filePath,
        fileContents,
        mimeType,
      };
    } catch {
      return null;
    }
  }

  public static async readComponentFiles(component: SourceComponent): Promise<FileReadResult[]> {
    const componentName = component.fullName ?? component.name;
    if (!componentName) {
      return [];
    }

    let filePaths = Array.from(component.walkContent());

    // Some component types (e.g. FlexiPage) have no separate content files —
    // their definition lives entirely in the XML metadata file.
    if (filePaths.length === 0 && component.xml) {
      filePaths = [component.xml];
    }

    const fileReadPromises = filePaths.map((filePath) => FileProcessor.readComponentFile(componentName, filePath));

    const fileResults = await Promise.all(fileReadPromises);
    return fileResults.filter((result): result is FileReadResult => result !== null);
  }

  public static updateMetaXml(xmlContent: string, result: EnrichmentResult, componentTypeName?: string): string {
    const parser = new XMLParser({
      htmlEntities: true,
      ignoreAttributes: false,
      processEntities: false,
      trimValues: true,
    });
    const builder = new XMLBuilder({
      format: true,
      ignoreAttributes: false,
      processEntities: false,
    });

    try {
      const xmlObj = parser.parse(xmlContent) as Record<string, Record<string, unknown>>;
      const rootKey = Object.keys(xmlObj).find((k) => k !== '?xml');
      if (!rootKey) {
        throw new SfError(messages.getMessage('errors.parsing.xml',[result.resourceName]));
      }

      if (!xmlObj[rootKey]) {
        xmlObj[rootKey] = {};
      }

      const schema = (componentTypeName ? METADATA_TYPE_CONFIGS[componentTypeName]?.xmlSchema : undefined) ?? DEFAULT_XML_METADATA_SCHEMA;
      schema.applyEnrichment(xmlObj[rootKey], result);

      const builtXml = builder.build(xmlObj);
      return builtXml.trim().replace(/\n{3,}/g, '\n\n');
    } catch (error) {
      throw new SfError(messages.getMessage('errors.parsing.xml', [error instanceof Error ? error.message : String(error)]));
    }
  }

  /**
   * Checks if the component has opted out of enrichment.
   * Delegates to the per-type XML schema's isSkipUpliftEnabled implementation.
   */
  private static isSkipUpliftEnabled(xmlContent: string, componentTypeName?: string): boolean {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: false, trimValues: true });
      const xmlObj = parser.parse(xmlContent) as Record<string, unknown>;
      const rootKey = Object.keys(xmlObj).find((k) => k !== '?xml');
      if (!rootKey) return false;

      const xmlRoot = xmlObj[rootKey] as Record<string, unknown> | undefined;
      if (!xmlRoot) return false;

      const schema = (componentTypeName ? METADATA_TYPE_CONFIGS[componentTypeName]?.xmlSchema : undefined) ?? DEFAULT_XML_METADATA_SCHEMA;
      return schema.isSkipUpliftEnabled(xmlRoot);
    } catch {
      return false;
    }
  }
}
