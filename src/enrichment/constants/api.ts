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

import type { MetadataType } from '@salesforce/source-deploy-retrieve';
import { DEFAULT_XML_METADATA_SCHEMA, SALESFORCE_OBJECT_XML_METADATA_SCHEMA } from '../../schemas/index.js';
import type { MetadataTypeConfig } from '../../schemas/index.js';
import type { EnrichmentRequestBody, EnrichMetadataResponse } from '../types/index.js';
import {
  SOURCE_COMPONENT_TYPE_NAME_SALESFORCE_OBJECT,
  SOURCE_COMPONENT_TYPE_NAME_FLEXIPAGE,
  SOURCE_COMPONENT_TYPE_NAME_LIGHTNING_TYPE,
  SOURCE_COMPONENT_TYPE_NAME_LWC,
} from './component.js';

export enum EnrichmentStatus {
  NOT_PROCESSED = 'NOT_PROCESSED',
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
  SKIPPED = 'SKIPPED',
}

export type EnrichmentRequestRecord = {
  componentName: string;
  componentType: MetadataType;
  requestBody: EnrichmentRequestBody | null;
  response: EnrichMetadataResponse | null;
  message: string | null;
  status: EnrichmentStatus;
};

export const API_ENDPOINT_ENRICHMENT = '/services/data/v66.0/metadata-intelligence/enrichments/on-demand';

export const ENRICHMENT_REQUEST_ENTITY_ENCODING_HEADER = 'X-Chatter-Entity-Encoding';

// Connect API values for supported metadata types
export const API_METADATA_TYPE_SALESFORCE_OBJECT = 'SalesforceObject';
export const API_METADATA_TYPE_FLEXIPAGE = 'FlexiPage';
export const API_METADATA_TYPE_LIGHTNING_TYPE = 'LightningType';
export const API_METADATA_TYPE_LWC = 'Lwc';
export const API_METADATA_TYPE_GENERIC = 'Generic';

/**
 * Central registry for all supported metadata types.
 * 
 * To add support for a new type:
 * 1. Add the source component type name constant to component.ts (SOURCE_COMPONENT_TYPE_NAME_*)
 * 2. Add the Connect API type constant above (API_METADATA_TYPE_*)
 * 3. Add a mapping entry here to connect the source component type name to the Connect API type
 * 4. If the type has a different XML metadata structure, define a new schema in src/schemas/schemas.ts and map it here - otherwise reuse DEFAULT_XML_METADATA_SCHEMA
 */
export const METADATA_TYPE_CONFIGS: Record<string, MetadataTypeConfig> = {
  [SOURCE_COMPONENT_TYPE_NAME_SALESFORCE_OBJECT]:
    { apiType: API_METADATA_TYPE_SALESFORCE_OBJECT,
      xmlSchema: SALESFORCE_OBJECT_XML_METADATA_SCHEMA },
  [SOURCE_COMPONENT_TYPE_NAME_FLEXIPAGE]: 
    { apiType: API_METADATA_TYPE_FLEXIPAGE, 
      xmlSchema: DEFAULT_XML_METADATA_SCHEMA },
  [SOURCE_COMPONENT_TYPE_NAME_LIGHTNING_TYPE]: 
    { apiType: API_METADATA_TYPE_LIGHTNING_TYPE, 
      xmlSchema: DEFAULT_XML_METADATA_SCHEMA },
  [SOURCE_COMPONENT_TYPE_NAME_LWC]: {
       apiType: API_METADATA_TYPE_LWC, 
       xmlSchema: DEFAULT_XML_METADATA_SCHEMA },
};

export const SUPPORTED_COMPONENT_TYPES: ReadonlySet<string> = new Set(Object.keys(METADATA_TYPE_CONFIGS));

export const MAP_SOURCE_COMPONENT_TYPE_TO_METADATA_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(METADATA_TYPE_CONFIGS).map(([sourceType, config]) => [sourceType, config.apiType]),
);

