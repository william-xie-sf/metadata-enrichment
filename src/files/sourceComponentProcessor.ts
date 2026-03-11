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

import { RegistryAccess, type SourceComponent, type MetadataType } from '@salesforce/source-deploy-retrieve';
import { Messages } from '@salesforce/core/messages';
import type { MetadataTypeAndName } from '../common/types.js';
import type { EnrichmentRequestRecord } from '../enrichment/constants/api.js';
import { EnrichmentStatus } from '../enrichment/constants/api.js';
import { SUPPORTED_COMPONENT_TYPES } from '../enrichment/constants/api.js';

Messages.importMessagesDirectory(import.meta.dirname);
const messages = Messages.loadMessages('@salesforce/metadata-enrichment', 'errors');

export class SourceComponentProcessor {
  /**
   *
   * Determine the components to SKIP based on the source components and the metadata entries.
   * This includes:
   * - Input components that do not exist in the source project
   * - Components of unsupported types (not in SUPPORTED_COMPONENT_TYPES)
   * - Components that fail type-specific validation (e.g., missing metadata configuration file)
   *
   * @param sourceComponents
   * @param metadataEntries
   * @param projectDir
   * @returns
   */
  public static getComponentsToSkip(
    sourceComponents: SourceComponent[],
    metadataEntries: string[],
    projectDir?: string,
  ): Set<EnrichmentRequestRecord> {
    const requestedComponents = SourceComponentProcessor.parseRequestedComponents(metadataEntries, projectDir);
    const missingComponents = SourceComponentProcessor.diffRequestedComponents(sourceComponents, requestedComponents);
    const filteredComponents = SourceComponentProcessor.filterComponents(sourceComponents, requestedComponents);
    return new Set([...missingComponents, ...filteredComponents]);
  }

  private static filterComponents(
    sourceComponents: SourceComponent[],
    requestedComponents: Set<MetadataTypeAndName>,
  ): Set<EnrichmentRequestRecord> {
    const sourceComponentMap = SourceComponentProcessor.createSourceComponentMap(sourceComponents);
    const filteredComponents = new Set<EnrichmentRequestRecord>();

    for (const requestedComponent of requestedComponents) {
      if (!requestedComponent?.componentName) continue;

      const sourceComponent = sourceComponentMap.get(requestedComponent.componentName);
      if (!sourceComponent) continue;

      const typeName = sourceComponent.type?.name ?? '';

      // Filter out unsupported component types
      if (!SUPPORTED_COMPONENT_TYPES.has(typeName)) {
        filteredComponents.add({
          componentName: requestedComponent.componentName,
          componentType: sourceComponent.type,
          requestBody: null,
          response: null,
          message: messages.getMessage('errors.unsupported.type', [typeName]),
          status: EnrichmentStatus.SKIPPED,
        });
        continue;
      }

      // Filter out supported components missing their metadata file
      if (sourceComponent.xml === undefined) {
        filteredComponents.add({
          componentName: requestedComponent.componentName,
          componentType: sourceComponent.type,
          requestBody: null,
          response: null,
          message: messages.getMessage('errors.component.configuration.not.found'),
          status: EnrichmentStatus.SKIPPED,
        });
      }
    }

    return filteredComponents;
  }

  private static diffRequestedComponents(
    sourceComponents: SourceComponent[],
    requestedComponents: Set<MetadataTypeAndName>,
  ): Set<EnrichmentRequestRecord> {
    const existingSourceComponentNames = SourceComponentProcessor.getExistingSourceComponentNames(sourceComponents);
    const missingComponents = new Set<EnrichmentRequestRecord>();
    for (const requestedComponent of requestedComponents) {
      if (requestedComponent.componentName && !existingSourceComponentNames.has(requestedComponent.componentName)) {
        missingComponents.add({
          componentName: requestedComponent.componentName,
          componentType: { name: requestedComponent.typeName } as MetadataType,
          requestBody: null,
          response: null,
          message: messages.getMessage('errors.component.not.found'),
          status: EnrichmentStatus.SKIPPED,
        });
      }
    }
    return missingComponents;
  }

  private static parseRequestedComponents(metadataEntries: string[], projectDir?: string): Set<MetadataTypeAndName> {
    const requestedComponents = new Set<MetadataTypeAndName>();

    for (const entry of metadataEntries) {
      const parsed = SourceComponentProcessor.parseMetadataEntry(entry, projectDir);
      if (!parsed) {
        continue;
      }

      // Ignore wildcarded component names
      if (parsed.componentName?.includes('*')) {
        continue;
      }

      requestedComponents.add(parsed);
    }

    return requestedComponents;
  }

  private static getExistingSourceComponentNames(sourceComponents: SourceComponent[]): Set<string> {
    const existingSourceComponentNames = new Set<string>();
    for (const component of sourceComponents) {
      const componentName = component.fullName ?? component.name;
      if (componentName) {
        existingSourceComponentNames.add(componentName);
      }
    }
    return existingSourceComponentNames;
  }

  private static createSourceComponentMap(sourceComponents: SourceComponent[]): Map<string, SourceComponent> {
    const componentMap = new Map<string, SourceComponent>();

    for (const component of sourceComponents) {
      const componentName = component.fullName ?? component.name;
      if (componentName) {
        componentMap.set(componentName, component);
      }
    }

    return componentMap;
  }

  private static parseMetadataEntry(rawEntry: string, projectDir?: string): MetadataTypeAndName | null {
    try {
      const registry = new RegistryAccess(undefined, projectDir);
      // Split on the first colon, and then join the rest back together to support names that include colons
      const [typeName, ...nameParts] = rawEntry.split(':');
      const type = registry.getTypeByName(typeName.trim());
      if (!type) {
        return null;
      }
      const metadataName = nameParts.length > 0 ? nameParts.join(':').trim() : '*';
      // Return null for wildcards since componentName is required
      if (metadataName === '*') {
        return null;
      }
      return {
        typeName: type.name,
        componentName: metadataName,
      };
    } catch {
      return null;
    }
  }
}
