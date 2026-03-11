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

export { SourceComponentProcessor, FileProcessor } from './files/index.js';
export type { FileReadResult } from './files/index.js';

export {
  getMimeTypeFromExtension,
  API_ENDPOINT_ENRICHMENT,
  SUPPORTED_MIME_TYPES,
  EnrichmentHandler,
  EnrichmentMetrics,
  EnrichmentRecords,
  EnrichmentStatus,
} from './enrichment/index.js';
export type {
  ContentBundleFile,
  ContentBundle,
  EnrichmentRequestBody,
  EnrichmentMetadata,
  EnrichmentResult,
  EnrichMetadataResponse,
  EnrichmentRequestRecord,
} from './enrichment/index.js';

export type { ComponentEnrichmentStatus, MetadataTypeAndName } from './common/index.js';
